import { cleanupExpiredWorldIdVerifications } from '../src/lib/database';

async function main() {
  const removed = await cleanupExpiredWorldIdVerifications();
  console.log(`Registros de sesión expirados eliminados: ${removed}`);
}

main().catch((error) => {
  console.error('Error al limpiar sesiones expiradas', error);
  process.exit(1);
});
