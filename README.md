# Speedcube Timer

Timer web para speedcubing con zonas de entrenamiento. Inspirado en Twisty Timer.

## Cómo ejecutarlo

```bash
npm install
npm run dev       # servidor de desarrollo
npm run build     # build de producción en dist/
npm run preview   # previsualizar el build
```

Requiere Node.js 18 o superior.

## Controles

| Acción | Teclado | Táctil / ratón |
|---|---|---|
| Preparar | Mantener Espacio hasta que se ponga verde | Mantener pulsada el área del timer |
| Empezar | Soltar Espacio | Soltar |
| Detener | Cualquier tecla | Tocar en cualquier parte |
| Cancelar | Esc | — |

Con la inspección de 15 s activada: primero mantener y soltar para iniciar la inspección, y luego mantener y soltar de nuevo para empezar a resolver.

## Estructura

```
src/
├── core/            # lógica pura, sin React
│   ├── timer.js     # máquina de estados del cronómetro
│   ├── display.js   # qué texto y pista mostrar según el estado
│   ├── format.js    # formato de tiempos
│   ├── stats.js     # mejor, media, ao5, ao12...
│   └── scramble/    # generadores de mezclas por puzzle
├── training/zones/  # zonas de entrenamiento (una carpeta por zona)
├── storage/         # persistencia (IndexedDB hoy; intercambiable)
├── hooks/           # conexión entre core/storage y React
├── components/
├── App.jsx
├── main.jsx
└── styles.css
```

## Notas

- Las mezclas son de movimientos aleatorios, no de estado aleatorio. Para práctica diaria sirven, pero no son equivalentes a las de competencia.
- Los datos se guardan solo en el navegador donde se usa la app.
