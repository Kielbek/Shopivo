package pl.shopivo.media;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import pl.shopivo.shared.error.ApiException;
import pl.shopivo.shared.error.BusinessRuleException;

/**
 * Validates uploaded images by their content (magic bytes + decoder), refuses decompression bombs before decoding
 * and produces re-encoded JPEG variants. Re-encoding strips EXIF metadata (e.g. GPS of the photographer) — only the
 * variants are ever served.
 */
@Component
public class ImageProcessor {

    public static final int MAX_BYTES = 10 * 1024 * 1024;
    static final int MAX_SIDE = 8000;
    static final long MAX_PIXELS = 40_000_000L;
    /** Published variant widths (also the URL names: w400.jpg / w400.png, w1200.jpg / w1200.png). */
    public static final int[] WIDTHS = {400, 1200};

    /**
     * {@code variantExt}: "png" when the image really uses transparency (cut-outs keep their transparent background),
     * otherwise "jpg".
     */
    public record Processed(String format, int width, int height, Map<Integer, byte[]> variants, String variantExt, String color) {
    }

    /**
     * A decoded 40 MP image takes ~160 MB of heap (320 MB for 16-bit PNG). Bounding concurrent decodes keeps a burst of
     * uploads from exhausting the JVM heap; callers that cannot get a slot in time receive 503.
     */
    private final Semaphore slots;

    public ImageProcessor(@Value("${shopivo.media.max-concurrent-processing:2}") int maxConcurrent) {
        this.slots = new Semaphore(Math.max(1, maxConcurrent), true);
        ImageIO.setUseCache(false); // decode in memory, no temp files
    }

    /** {@link #process} with the concurrency bound. */
    public Processed processLimited(byte[] data) {
        try {
            if (!slots.tryAcquire(30, TimeUnit.SECONDS)) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "IMAGE_PROCESSING_BUSY",
                        "Serwer przetwarza teraz wiele zdjęć. Spróbuj ponownie za chwilę.");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "IMAGE_PROCESSING_BUSY", "Spróbuj ponownie za chwilę.");
        }
        try {
            return process(data);
        } finally {
            slots.release();
        }
    }

    public Processed process(byte[] data) {
        if (data == null || data.length == 0) throw new BusinessRuleException("EMPTY_FILE", "Plik jest pusty.");
        if (data.length > MAX_BYTES) throw new BusinessRuleException("FILE_TOO_LARGE", "Zdjęcie może mieć najwyżej 10 MB.");
        String format = sniff(data);
        if (format == null) throw new BusinessRuleException("UNSUPPORTED_IMAGE", "Obsługiwane formaty: JPEG i PNG.");
        BufferedImage image = decode(data, format);
        // Phone photos are stored sideways with an EXIF orientation flag; variants are written upright (and without EXIF).
        int orientation = "jpeg".equals(format) ? exifOrientation(data) : 1;
        boolean swap = orientation >= 5;
        int width = swap ? image.getHeight() : image.getWidth();
        int height = swap ? image.getWidth() : image.getHeight();
        boolean alpha = "png".equals(format) && transparent(image);
        Map<Integer, byte[]> variants = new LinkedHashMap<>();
        for (int w : WIDTHS) {
            BufferedImage scaled = resize(image, w, orientation, alpha);
            variants.put(w, alpha ? png(scaled) : jpeg(scaled));
        }
        return new Processed(format, width, height, variants, alpha ? "png" : "jpg", dominantColor(image));
    }

    static String sniff(byte[] d) {
        if (d.length > 3 && (d[0] & 0xFF) == 0xFF && (d[1] & 0xFF) == 0xD8 && (d[2] & 0xFF) == 0xFF) return "jpeg";
        if (d.length > 8 && (d[0] & 0xFF) == 0x89 && d[1] == 'P' && d[2] == 'N' && d[3] == 'G') return "png";
        return null;
    }

    private static BufferedImage decode(byte[] data, String format) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
            Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(format);
            if (!readers.hasNext()) throw new BusinessRuleException("UNSUPPORTED_IMAGE", "Nieobsługiwany format obrazu.");
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                int w = reader.getWidth(0);
                int h = reader.getHeight(0);
                // Checked from the header, before allocating pixels.
                if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE || (long) w * h > MAX_PIXELS) {
                    throw new BusinessRuleException("IMAGE_TOO_LARGE", "Zdjęcie może mieć najwyżej 8000 × 8000 px.");
                }
                BufferedImage image = reader.read(0);
                if (image == null) throw new BusinessRuleException("UNSUPPORTED_IMAGE", "Nie udało się odczytać zdjęcia.");
                return image;
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof BusinessRuleException b) throw b;
            throw new BusinessRuleException("UNSUPPORTED_IMAGE", "Plik nie jest prawidłowym zdjęciem.");
        }
    }

    /**
     * EXIF orientation (1–8) of a JPEG, read from the APP1 segment's first IFD; 1 when absent or malformed. Every read is
     * bounds-checked — the bytes are untrusted.
     */
    static int exifOrientation(byte[] d) {
        int i = 2;
        while (i + 4 <= d.length && (d[i] & 0xFF) == 0xFF) {
            int marker = d[i + 1] & 0xFF;
            if (marker == 0xDA || marker == 0xD9) break;
            int len = u16(d, i + 2, true);
            if (len < 2 || i + 2 + len > d.length) break;
            if (marker == 0xE1 && len >= 16 && d[i + 4] == 'E' && d[i + 5] == 'x' && d[i + 6] == 'i' && d[i + 7] == 'f'
                    && d[i + 8] == 0 && d[i + 9] == 0) {
                int tiff = i + 10;
                int end = i + 2 + len;
                boolean big;
                if (d[tiff] == 'M' && d[tiff + 1] == 'M') big = true;
                else if (d[tiff] == 'I' && d[tiff + 1] == 'I') big = false;
                else return 1;
                long ifd = u32(d, tiff + 4, big);
                if (ifd < 8 || tiff + ifd + 2 > end) return 1;
                int pos = (int) (tiff + ifd);
                int count = u16(d, pos, big);
                for (int e = 0; e < count && e < 200; e++) {
                    int entry = pos + 2 + e * 12;
                    if (entry + 12 > end) return 1;
                    if (u16(d, entry, big) == 0x0112) {
                        int v = u16(d, entry + 8, big);
                        return v >= 1 && v <= 8 ? v : 1;
                    }
                }
                return 1;
            }
            i += 2 + len;
        }
        return 1;
    }

    private static int u16(byte[] d, int o, boolean big) {
        return big ? ((d[o] & 0xFF) << 8) | (d[o + 1] & 0xFF) : ((d[o + 1] & 0xFF) << 8) | (d[o] & 0xFF);
    }

    private static long u32(byte[] d, int o, boolean big) {
        if (o + 4 > d.length) return -1;
        return big ? ((long) u16(d, o, true) << 16) | u16(d, o + 2, true) : ((long) u16(d, o + 2, false) << 16) | u16(d, o, false);
    }

    /** Maps source pixels to the upright image for an EXIF orientation (source size w × h). */
    static AffineTransform orientationTransform(int orientation, int w, int h) {
        return switch (orientation) {
            case 2 -> new AffineTransform(-1, 0, 0, 1, w, 0);
            case 3 -> new AffineTransform(-1, 0, 0, -1, w, h);
            case 4 -> new AffineTransform(1, 0, 0, -1, 0, h);
            case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);
            case 6 -> new AffineTransform(0, 1, -1, 0, h, 0);
            case 7 -> new AffineTransform(0, -1, -1, 0, h, w);
            case 8 -> new AffineTransform(0, -1, 1, 0, 0, w);
            default -> new AffineTransform();
        };
    }

    /**
     * The image's main colour as #rrggbb, for backgrounds a template puts behind the photo (e.g. a tinted card behind
     * a cut-out toy). Visible pixels are sampled; the most frequent hue among clearly coloured ones wins and their
     * average is returned. Mostly grey/white/black images give their average colour.
     */
    static String dominantColor(BufferedImage image) {
        int w = image.getWidth(), h = image.getHeight();
        int step = Math.max(1, (int) Math.sqrt((double) w * h / 40_000));
        long[][] buckets = new long[13][4]; // 12 hue buckets + 1 for unsaturated pixels: r, g, b, count
        float[] hsb = new float[3];
        for (int y = 0; y < h; y += step) {
            for (int x = 0; x < w; x += step) {
                int argb = image.getRGB(x, y);
                if ((argb >>> 24) < 200) continue;
                int r = (argb >> 16) & 0xFF, g = (argb >> 8) & 0xFF, b = argb & 0xFF;
                Color.RGBtoHSB(r, g, b, hsb);
                int bucket = hsb[1] > 0.25f && hsb[2] > 0.2f ? Math.min(11, (int) (hsb[0] * 12)) : 12;
                long[] a = buckets[bucket];
                a[0] += r; a[1] += g; a[2] += b; a[3]++;
            }
        }
        long[] best = null;
        for (int i = 0; i < 12; i++) if (buckets[i][3] > 0 && (best == null || buckets[i][3] > best[3])) best = buckets[i];
        long coloured = 0;
        for (int i = 0; i < 12; i++) coloured += buckets[i][3];
        // Hardly any colour (a grey product on white): the overall average
        if (best == null || coloured < (coloured + buckets[12][3]) / 10) {
            best = new long[4];
            for (long[] a : buckets) { best[0] += a[0]; best[1] += a[1]; best[2] += a[2]; best[3] += a[3]; }
        }
        if (best[3] == 0) return null;
        return String.format("#%02x%02x%02x", best[0] / best[3], best[1] / best[3], best[2] / best[3]);
    }

    /** True when at least one pixel is not fully opaque (a PNG with an unused alpha channel is treated as opaque). */
    static boolean transparent(BufferedImage image) {
        if (!image.getColorModel().hasAlpha()) return false;
        int w = image.getWidth(), h = image.getHeight();
        int[] row = new int[w];
        for (int y = 0; y < h; y++) {
            image.getRGB(0, y, w, 1, row, 0, w);
            for (int argb : row) if ((argb >>> 24) != 0xFF) return true;
        }
        return false;
    }

    /** Scales down to {@code width} (never up), upright; without {@code keepAlpha} transparency is flattened onto white. */
    private static BufferedImage resize(BufferedImage src, int width, int orientation, boolean keepAlpha) {
        boolean swap = orientation >= 5;
        int ow = swap ? src.getHeight() : src.getWidth();
        int oh = swap ? src.getWidth() : src.getHeight();
        int w = Math.min(width, ow);
        int h = Math.max(1, (int) Math.round(oh * (w / (double) ow)));
        BufferedImage out = new BufferedImage(w, h, keepAlpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            if (!keepAlpha) {
                g.setColor(Color.WHITE);
                g.fillRect(0, 0, w, h);
            }
            AffineTransform t = AffineTransform.getScaleInstance(w / (double) ow, h / (double) oh);
            t.concatenate(orientationTransform(orientation, src.getWidth(), src.getHeight()));
            g.drawImage(src, t, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    private static byte[] png(BufferedImage image) {
        try (ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            if (!ImageIO.write(image, "png", bytes)) throw new IllegalStateException("No PNG writer");
            return bytes.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("PNG encoding failed", e);
        }
    }

    private static byte[] jpeg(BufferedImage image) {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        try (ByteArrayOutputStream bytes = new ByteArrayOutputStream(); ImageOutputStream out = ImageIO.createImageOutputStream(bytes)) {
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(0.85f);
            writer.setOutput(out);
            writer.write(null, new IIOImage(image, null, null), param);
            out.flush();
            return bytes.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("JPEG encoding failed", e);
        } finally {
            writer.dispose();
        }
    }
}
