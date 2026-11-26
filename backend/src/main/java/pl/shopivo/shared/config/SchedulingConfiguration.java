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
import org.springframework.modulith.events.CompletedEventPublications;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.modulith.events.ResubmissionOptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.time.Instant;
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
    EventRedelivery eventRedelivery(IncompleteEventPublications publications, CompletedEventPublications completed, DataSource dataSource) {
        return new EventRedelivery(publications, completed, new JdbcTemplate(dataSource));
    }

    /**
     * Outbox upkeep. Failed listeners (e.g. SMTP down) are retried with a growing pause — 5 min, 10, 20 … up to 6 h —
     * at most {@link #MAX_ATTEMPTS} times. A publication that still fails stays in the table as a dead letter: it is
     * no longer retried (a permanently bad address must not be hammered forever) and is reported once a day.
     */
    public static class EventRedelivery {

        private static final Logger log = LoggerFactory.getLogger(EventRedelivery.class);
        static final int MAX_ATTEMPTS = 10;
        private static final Duration MAX_PAUSE = Duration.ofHours(6);

        private final IncompleteEventPublications publications;
        private final CompletedEventPublications completed;
        private final JdbcTemplate jdbc;

        EventRedelivery(IncompleteEventPublications publications, CompletedEventPublications completed, JdbcTemplate jdbc) {
            this.publications = publications;
            this.completed = completed;
            this.jdbc = jdbc;
        }

        @Scheduled(fixedDelayString = "PT5M", initialDelayString = "PT2M")
        @SchedulerLock(name = "events.redelivery", lockAtMostFor = "PT4M")
        public void resubmit() {
            Instant now = Instant.now();
            publications.resubmitIncompletePublications(ResubmissionOptions.defaults().withMinAge(Duration.ofMinutes(5))
                    .withFilter(p -> isDue(p.getCompletionAttempts(), p.getLastPublicationDate(), now)));
        }

        static boolean isDue(int attempts, Instant lastAttempt, Instant now) {
            if (attempts >= MAX_ATTEMPTS) return false;
            Duration pause = Duration.ofMinutes(5).multipliedBy(1L << Math.min(Math.max(attempts - 1, 0), 10));
            if (pause.compareTo(MAX_PAUSE) > 0) pause = MAX_PAUSE;
            return lastAttempt == null || !lastAttempt.plus(pause).isAfter(now);
        }

        @Scheduled(cron = "${shopivo.events.cleanup-cron:0 37 4 * * *}")
        @SchedulerLock(name = "events.cleanup", lockAtMostFor = "PT20M")
        public void cleanup() {
            completed.deletePublicationsOlderThan(Duration.ofDays(30));
            Integer dead = jdbc.queryForObject("select count(*) from event_publication where completion_date is null and completion_attempts >= ?",
                    Integer.class, MAX_ATTEMPTS);
            if (dead != null && dead > 0) {
                log.error("{} event publication(s) failed {} times and are no longer retried — check the listener errors in the logs",
                        dead, MAX_ATTEMPTS);
            }
        }
    }
}
