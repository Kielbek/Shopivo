package pl.shopivo.shared.tenancy;

import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.hibernate.cfg.MultiTenancySettings;
import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class TenancyConfiguration {

    /** Hibernate tenant id used when no tenant is bound: matches no rows, fails FK checks on insert. */
    static final UUID NO_TENANT = new UUID(0L, 0L);
    /** Hibernate "root" tenant: filtering disabled. Only used inside {@link TenantContext#callAsSystem}. */
    static final UUID ROOT_TENANT = new UUID(-1L, -1L);

    @Bean
    static BeanPostProcessor tenantAwareDataSourcePostProcessor() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                if (bean instanceof DataSource ds && !(bean instanceof TenantAwareDataSource)
                        && "dataSource".equals(beanName)) {
                    return new TenantAwareDataSource(ds);
                }
                return bean;
            }
        };
    }

    @Bean
    HibernatePropertiesCustomizer tenantIdentifierResolverCustomizer() {
        CurrentTenantIdentifierResolver<UUID> resolver = new CurrentTenantIdentifierResolver<>() {
            @Override
            public UUID resolveCurrentTenantIdentifier() {
                if (TenantContext.isSystem()) {
                    return ROOT_TENANT;
                }
                return TenantContext.tenantId().orElse(NO_TENANT);
            }

            @Override
            public boolean validateExistingCurrentSessions() {
                return false;
            }

            @Override
            public boolean isRoot(UUID tenantId) {
                return ROOT_TENANT.equals(tenantId);
            }
        };
        return (Map<String, Object> properties) ->
                properties.put(MultiTenancySettings.MULTI_TENANT_IDENTIFIER_RESOLVER, resolver);
    }
}
