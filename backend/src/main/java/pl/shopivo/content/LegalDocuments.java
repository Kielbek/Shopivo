package pl.shopivo.content;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.shared.tenancy.TenantContext;

/** Which published revision of a legal document is in force (recorded with each order). */
@Service
public class LegalDocuments {

    private final JdbcTemplate jdbc;

    LegalDocuments(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public Optional<UUID> currentRevision(LegalKey key) {
        return jdbc.query("""
                select r.id from content_entries e join content_revisions r on r.entry_id = e.id and r.revision = e.published_revision
                where e.tenant_id = ? and e.system_key = ? and e.status = 'PUBLISHED'
                """, (rs, i) -> rs.getObject(1, UUID.class), TenantContext.requireTenantId(), key.name()).stream().findFirst();
    }
}
