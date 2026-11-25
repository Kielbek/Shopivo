package pl.shopivo.shared.config;

import java.time.Duration;
import javax.sql.DataSource;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.scheduling.annotation.Scheduled;

/** Distributed locks for scheduled jobs (one replica runs each job) and outbox redelivery. */
@Configuration(proxyBeanMethods = false)
@EnableSchedulerLock(defaultLockAtMostFor = "PT10M")
public class SchedulingConfiguration {

    @Bean
    LockProvider lockProvider(DataSource dataSource) {
        return new JdbcTemplateLockProvider(JdbcTemplateLockProvider.Configuration.builder()
                .withJdbcTemplate(new JdbcTemplate(dataSource))
                .usingDbTime()
                .build());
    }

    @Bean
    EventRedelivery eventRedelivery(IncompleteEventPublications publications) {
        return new EventRedelivery(publications);
    }

    /** Re-submits event publications (e.g. e-mails) whose listener failed, e.g. because SMTP was unavailable. */
    public static class EventRedelivery {

        private final IncompleteEventPublications publications;

        EventRedelivery(IncompleteEventPublications publications) {
            this.publications = publications;
        }

        @Scheduled(fixedDelayString = "PT5M", initialDelayString = "PT2M")
        @SchedulerLock(name = "events.redelivery", lockAtMostFor = "PT4M")
        public void resubmit() {
            publications.resubmitIncompletePublicationsOlderThan(Duration.ofMinutes(5));
        }
    }
}
