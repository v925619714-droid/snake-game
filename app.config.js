// Динамический конфиг: baseUrl нужен только для GitHub Pages (прод web).
// Локально экспортируем с LOCAL_WEB=1 — пути от корня (для статик-сервера/превью).
const appJson = require('./app.json');

module.exports = () => {
  const expo = { ...appJson.expo };
  if (!process.env.LOCAL_WEB) {
    expo.experiments = { ...(expo.experiments || {}), baseUrl: '/snake-game' };
  }
  return { expo };
};
