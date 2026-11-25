package pl.shopivo.tenants;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class StoreRoleTest {

    @Test
    void permissionMatrixMatchesSecurityDocumentation() {
        assertThat(StoreRole.OWNER.permissions()).containsExactlyInAnyOrder(StorePermission.values());
        assertThat(StoreRole.ADMIN.has(StorePermission.BILLING_MANAGE)).isFalse();
        assertThat(StoreRole.ADMIN.has(StorePermission.STORE_DELETE)).isFalse();
        assertThat(StoreRole.ADMIN.has(StorePermission.TEAM_MANAGE)).isTrue();
        assertThat(StoreRole.MANAGER.has(StorePermission.TEAM_MANAGE)).isFalse();
        assertThat(StoreRole.PRODUCT_MANAGER.has(StorePermission.ORDERS_READ)).isFalse();
        assertThat(StoreRole.PRODUCT_MANAGER.has(StorePermission.STORE_SETTINGS_WRITE)).isFalse();
        assertThat(StoreRole.ORDER_MANAGER.has(StorePermission.ORDERS_WRITE)).isTrue();
        assertThat(StoreRole.ORDER_MANAGER.has(StorePermission.PRODUCTS_WRITE)).isFalse();
        assertThat(StoreRole.CUSTOMER_SUPPORT.has(StorePermission.CUSTOMERS_WRITE)).isTrue();
        assertThat(StoreRole.CUSTOMER_SUPPORT.has(StorePermission.ORDERS_WRITE)).isFalse();
        for (StoreRole role : StoreRole.values()) {
            assertThat(role.has(StorePermission.STORE_READ)).as(role.name()).isTrue();
        }
    }
}
