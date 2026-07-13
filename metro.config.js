// Metro-конфиг Expo. Фикс под colyseus.js в React Native: его Node-сборка (build/esm)
// тянет `ws` (→ node `stream`) и `httpie` (→ node `https`), которых нет в RN. У colyseus.js
// есть browser-сборка (lib/), использующая ГЛОБАЛЬНЫЙ WebSocket (в RN есть) + httpie/xhr
// (XMLHttpRequest, в RN есть). Добавляем условие "browser" в резолвинг package exports —
// тогда colyseus.js и httpie резолвятся в свои browser-сборки. Порядок: react-native первым,
// чтобы RN-пакеты сохранили свои RN-сборки; "browser" — фолбэк для пакетов без RN-сборки.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require', 'import'];

module.exports = config;
