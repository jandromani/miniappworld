# Privacidad, consentimiento y derechos de usuario

## Política y datos sensibles
- Versión de política: `2024-10`.
- Campos sensibles cubiertos: `wallet_address`, `user_id`.
- Retención máxima comunicada: 30 días (configurable a menos desde el perfil).

## Endpoints
- `GET /api/player/privacy`: devuelve política vigente y consentimiento almacenado.
- `POST /api/player/privacy`: registra consentimiento (booleans de wallet/user_id, días de retención y canales opcionales). Requiere cookie `session_token`.
- `GET /api/player/data`: exporta JSON con perfil, progreso, pagos, leaderboard y consents del usuario autenticado.
- `DELETE /api/player/data`: elimina datos locales del usuario (wallet, user_id, pagos, progreso, consents y stats). Registra auditoría.

## Flujos UI
- **Home**: banner previo al verify con enlace a la política y recordatorio de retención y uso de wallet/user_id.
- **Perfil y privacidad**: sección accesible con
  - formulario de consentimiento (checkboxes + días de retención),
  - exportación en JSON descargable,
  - botón de borrado total con estado `aria-busy`.
- **/privacy**: landing con pasos para dar consentimiento y ejercer derechos.

## Pruebas rápidas
1. Ejecutar `npm test -- privacyRoutes` para validar rutas de exportación/borrado/consentimiento.
2. Con sesión activa, probar en UI:
   - Guardar consentimiento con retención menor a 30.
   - Exportar datos y descargar JSON.
   - Borrar datos y verificar que el perfil solicita nueva verificación.

## Notas de WCAG
- Se añadieron `role="status"`/`aria-live` a banners de carga/errores.
- Tabulación accesible en tablas (cabeceras con `scope="col"`, captions descriptivas).
- Botones principales con anillos de enfoque visibles y colores de mayor contraste.
