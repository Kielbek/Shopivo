package pl.shopivo.email;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.context.Context;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;
import pl.shopivo.shared.config.ShopivoProperties;

/**
 * Renders transactional e-mails from Thymeleaf templates in {@code classpath:email/}.
 * Each template defines the subject in a {@code <title>} element and the body; a plain-text alternative
 * is derived from the HTML. Merchant-customisable templates are planned for the notifications phase.
 */
@Component
public class EmailTemplates {

    private final SpringTemplateEngine engine;
    private final ShopivoProperties properties;

    public EmailTemplates(ShopivoProperties properties) {
        this.properties = properties;
        ClassLoaderTemplateResolver resolver = new ClassLoaderTemplateResolver();
        resolver.setPrefix("email/");
        resolver.setSuffix(".html");
        resolver.setTemplateMode(TemplateMode.HTML);
        resolver.setCharacterEncoding("UTF-8");
        resolver.setCacheable(true);
        this.engine = new SpringTemplateEngine();
        this.engine.setTemplateResolver(resolver);
    }

    public EmailMessage render(String template, String to, Map<String, Object> variables) {
        Map<String, Object> vars = new HashMap<>(variables);
        vars.putIfAbsent("appUrl", properties.appUrl());
        Context context = new Context(Locale.forLanguageTag("pl-PL"), vars);
        String html = engine.process(template, context);
        String subject = extract(html, "<title>", "</title>").trim();
        return new EmailMessage(to, subject, html, toText(html));
    }

    private static String extract(String html, String start, String end) {
        int s = html.indexOf(start);
        int e = html.indexOf(end, s + 1);
        return s >= 0 && e > s ? html.substring(s + start.length(), e) : "Shopivo";
    }

    static String toText(String html) {
        String body = html.replaceAll("(?is)<head.*?</head>", "")
                .replaceAll("(?is)<a [^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>", "$2: $1")
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("(?i)</(p|h1|h2|h3|tr|div)>", "\n\n")
                .replaceAll("<[^>]+>", "")
                .replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&quot;", "\"").replace("&#39;", "'");
        return body.replaceAll("[ \\t]+", " ").replaceAll("\\n\\s*\\n\\s*\\n+", "\n\n").trim();
    }
}
