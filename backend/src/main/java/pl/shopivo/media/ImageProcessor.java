package pl.shopivo.media;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
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
    /** Published variant widths (also the URL names: w400.jpg, w1200.jpg). */
    public static final int[] WIDTHS = {400, 1200};

    public record Processed(String format, int width, int height, Map<Integer, byte[]> variants) {
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
        Map<Integer, byte[]> variants = new LinkedHashMap<>();
        for (int width : WIDTHS) {
            variants.put(width, jpeg(resize(image, width)));
        }
        return new Processed(format, image.getWidth(), image.getHeight(), variants);
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

    /** Scales down to {@code width} (never up), flattening transparency onto white. */
    private static BufferedImage resize(BufferedImage src, int width) {
        int w = Math.min(width, src.getWidth());
        int h = Math.max(1, (int) Math.round(src.getHeight() * (w / (double) src.getWidth())));
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, w, h);
            g.drawImage(src, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        return out;
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
