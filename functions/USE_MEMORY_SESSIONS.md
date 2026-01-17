# 🔄 Cómo usar sesiones en memoria (sin Java)

Si no quieres instalar Java para testing local, puedes usar sesiones en memoria temporalmente.

## Cambiar a sesiones en memoria

1. Renombra el archivo actual:
```bash
cd functions/services
mv sessionService.js sessionService-firestore.js
mv sessionService-memory.js sessionService.js
```

2. Inicia emuladores:
```bash
firebase emulators:start
```

3. Ahora funcionará sin Java, pero las sesiones se perderán al reiniciar.

## Volver a Firestore

Para volver a usar Firestore (en producción o con Java instalado):

```bash
cd functions/services
mv sessionService.js sessionService-memory.js
mv sessionService-firestore.js sessionService.js
```

## Recomendación

**Mejor instalar Java** para tener la experiencia completa:
- https://adoptium.net/temurin/releases/
- Descarga el instalador Windows x64
- Instala y reinicia la terminal
