package pl.shopivo.media.internal;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import pl.shopivo.media.ObjectStorage;

/** Files in a local directory. Development/tests only — not shared between instances. */
class LocalObjectStorage implements ObjectStorage {

    private final Path root;

    LocalObjectStorage(Path root) {
        this.root = root.toAbsolutePath().normalize();
    }

    private Path resolve(String key) {
        Path p = root.resolve(key).normalize();
        if (!p.startsWith(root)) throw new IllegalArgumentException("Invalid storage key");
        return p;
    }

    @Override
    public void put(String key, byte[] content, String contentType) {
        try {
            Path target = resolve(key);
            Files.createDirectories(target.getParent());
            Path tmp = Files.createTempFile(target.getParent(), ".upload", ".tmp");
            Files.write(tmp, content);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public Optional<byte[]> get(String key) {
        try {
            Path p = resolve(key);
            return Files.isRegularFile(p) ? Optional.of(Files.readAllBytes(p)) : Optional.empty();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Override
    public void delete(String key) {
        try {
            Files.deleteIfExists(resolve(key));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
