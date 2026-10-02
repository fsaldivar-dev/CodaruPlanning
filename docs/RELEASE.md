# Publicación npm

Paquete: `@fsaldivar.dev/planning`. Binario CLI: `codaru-planning`.

La aplicación Tauri permanece en el repositorio; el paquete npm ofrece la API de dominio y el CLI de lectura/escritura. Los artefactos macOS no se incluyen en npm. La API y el CLI se validan instalando el tarball fuera del monorepositorio.

## Preparación

1. Actualizar la versión en `packages/planning/package.json` y regenerar `package-lock.json` con `npm install --package-lock-only`.
2. Ejecutar `npm test`, `npm run check` y `npm run desktop:build` cuando cambie el adaptador nativo.
3. Ejecutar `mkdir -p artifacts && npm run pack:planning`.
4. Ejecutar `node scripts/smoke-package.mjs artifacts/fsaldivar.dev-planning-VERSION.tgz`.
5. Revisar el contenido con `tar -tzf artifacts/fsaldivar.dev-planning-VERSION.tgz`. Solo contiene `dist/`, tipos, ejemplos, README, licencia y manifiesto.
6. Confirmar y subir el código de esa versión. Publicar el tarball revisado, no una carpeta distinta.

## Publicación

```sh
npm whoami
npm publish artifacts/fsaldivar.dev-planning-VERSION.tgz --access public
npm view @fsaldivar.dev/planning@VERSION version dist.integrity
npx --yes --package @fsaldivar.dev/planning@VERSION codaru-planning --version
```

Si npm exige verificación de identidad, completarla en su flujo oficial. No guardar tokens ni códigos de verificación en el repositorio. La configuración CI valida los paquetes; no publica automáticamente.

Referencias oficiales: [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/), [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/) y [exports/bin/files](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/).
