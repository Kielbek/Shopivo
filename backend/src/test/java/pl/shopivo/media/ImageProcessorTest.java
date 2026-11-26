package pl.shopivo.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import pl.shopivo.shared.error.BusinessRuleException;

class ImageProcessorTest {

    private final ImageProcessor processor = new ImageProcessor(1);

    /** 40×20 JPEG: left half red, right half white. */
    private static byte[] jpeg() throws Exception {
        BufferedImage img = new BufferedImage(40, 20, BufferedImage.TYPE_INT_RGB);
        var g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 40, 20);
        g.setColor(Color.RED);
        g.fillRect(0, 0, 20, 20);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "jpeg", out);
        return out.toByteArray();
    }

    /** Inserts an APP1 Exif segment with the orientation tag right after SOI. */
    private static byte[] withOrientation(byte[] jpeg, int orientation, boolean bigEndian) {
        byte[] tiff = bigEndian
                ? new byte[] {'M', 'M', 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, (byte) orientation, 0, 0, 0, 0, 0, 0, 0, 0}
                : new byte[] {'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, (byte) orientation, 0, 0, 0, 0, 0, 0, 0, 0, 0};
        int len = 2 + 6 + tiff.length;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(0xFF);
        out.write(0xD8);
        out.write(0xFF);
        out.write(0xE1);
        out.write(len >> 8);
        out.write(len & 0xFF);
        out.writeBytes(new byte[] {'E', 'x', 'i', 'f', 0, 0});
        out.writeBytes(tiff);
        out.write(jpeg, 2, jpeg.length - 2);
        return out.toByteArray();
    }

    private static BufferedImage variant(ImageProcessor.Processed p) throws Exception {
        return ImageIO.read(new ByteArrayInputStream(p.variants().get(400)));
    }

    private static boolean red(int rgb) {
        Color c = new Color(rgb);
        return c.getRed() > 180 && c.getGreen() < 90 && c.getBlue() < 90;
    }

    @Test
    void readsExifOrientationInBothByteOrders() throws Exception {
        assertThat(ImageProcessor.exifOrientation(jpeg())).isEqualTo(1);
        assertThat(ImageProcessor.exifOrientation(withOrientation(jpeg(), 6, true))).isEqualTo(6);
        assertThat(ImageProcessor.exifOrientation(withOrientation(jpeg(), 8, false))).isEqualTo(8);
        assertThat(ImageProcessor.exifOrientation(withOrientation(jpeg(), 99, true))).isEqualTo(1);
    }

    @Test
    void malformedExifIsIgnoredSafely() throws Exception {
        byte[] broken = withOrientation(jpeg(), 6, true);
        broken[12] = 0x7F; // corrupt the IFD offset
        assertThat(ImageProcessor.exifOrientation(broken)).isEqualTo(1);
        assertThat(ImageProcessor.exifOrientation(new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE1, 0x7F})).isEqualTo(1);
    }

    @Test
    void variantsAreWrittenUpright() throws Exception {
        var plain = processor.process(jpeg());
        assertThat(plain.width()).isEqualTo(40);
        BufferedImage p = variant(plain);
        assertThat(red(p.getRGB(5, 10))).isTrue();
        assertThat(red(p.getRGB(35, 10))).isFalse();

        // Orientation 6 = rotate 90° clockwise: the red left half ends up on top.
        var rotated = processor.process(withOrientation(jpeg(), 6, true));
        assertThat(rotated.width()).isEqualTo(20);
        assertThat(rotated.height()).isEqualTo(40);
        BufferedImage r = variant(rotated);
        assertThat(r.getWidth()).isEqualTo(20);
        assertThat(r.getHeight()).isEqualTo(40);
        assertThat(red(r.getRGB(10, 5))).isTrue();
        assertThat(red(r.getRGB(10, 35))).isFalse();

        // Orientation 3 = 180°: red moves to the right.
        BufferedImage u = variant(processor.process(withOrientation(jpeg(), 3, false)));
        assertThat(red(u.getRGB(35, 10))).isTrue();
        assertThat(red(u.getRGB(5, 10))).isFalse();
    }

    @Test
    void rejectsNonImages() {
        assertThatThrownBy(() -> processor.process("<svg/>".getBytes())).isInstanceOf(BusinessRuleException.class);
    }
}
