# Changelog

Todos los cambios relevantes de este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y versionado según [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

## [0.1.0] - 2026-10-21

### Añadido
- Estructura inicial del proyecto con Vite y React (build)
- Cronómetro con máquina de estados: mantener Espacio (o tocar) hasta que se ponga verde y soltar para empezar; cualquier tecla o toque lo detiene; Esc cancela (timer)
- Inspección opcional de 15 s con +2 automático entre 15 y 17 s y DNF pasados los 17 s (timer)
- Generador de mezclas de 3x3 por movimientos aleatorios (20 movimientos, sin repetir cara ni patrón R L R) y registro de puzzles para añadir más (scramble)
- Estadísticas de sesión: cantidad, mejor, media, ao5, ao12, mejor ao5 y mejor ao12, con recorte WCA y manejo de DNF (stats)
- Persistencia de los tiempos en IndexedDB, detrás de una capa de almacenamiento intercambiable (storage)
- Lista de la sesión con penalizaciones +2 y DNF por tiempo, eliminación de tiempos y opción de borrar la sesión (ui)
- Ajustes de inspección y de decimales (2 o 3), guardados en el navegador (ui)
- Interfaz responsive con colores de stickers de cubo por estado y modo sin distracciones mientras corre el timer (ui)
- Carpeta `src/training/zones/` reservada para las zonas de entrenamiento (training)
- README con instrucciones de uso y estructura del proyecto (docs)
