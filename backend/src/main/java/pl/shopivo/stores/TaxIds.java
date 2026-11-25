package pl.shopivo.stores;

public final class TaxIds {

    private static final int[] NIP_WEIGHTS = {6, 5, 7, 2, 3, 4, 5, 6, 7};

    private TaxIds() {
    }

    /** Normalizes "123-456-32-18" / "PL1234563218" to digits only. */
    public static String normalizeNip(String value) {
        if (value == null) {
            return null;
        }
        String v = value.trim().toUpperCase();
        if (v.startsWith("PL")) {
            v = v.substring(2);
        }
        return v.replaceAll("[\\s-]", "");
    }

    /** Validates a Polish NIP checksum. */
    public static boolean isValidNip(String value) {
        String nip = normalizeNip(value);
        if (nip == null || !nip.matches("\\d{10}")) {
            return false;
        }
        int sum = 0;
        for (int i = 0; i < 9; i++) {
            sum += (nip.charAt(i) - '0') * NIP_WEIGHTS[i];
        }
        int control = sum % 11;
        return control != 10 && control == nip.charAt(9) - '0';
    }
}
