/**
 * Cross-cutting building blocks shared by all modules: tenant context, error model, crypto, web helpers.
 * Must not depend on any business module.
 */
@ApplicationModule(type = ApplicationModule.Type.OPEN)
package pl.shopivo.shared;

import org.springframework.modulith.ApplicationModule;
