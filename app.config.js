// Динамический конфиг: baseUrl нужен только для GitHub Pages (прод web).
// Локально экспортируем с LOCAL_WEB=1 — пути от корня (для статик-сервера/превью).
const appJson = require('./app.json');

module.exports = () => {
  const expo = { ...appJson.expo };
  // Свой домен snake.skillmake.ru отдаётся с КОРНЯ → baseUrl не задаём (пути от корня).
  // Старый project-page /snake-game/ больше не используем (есть custom domain + CNAME).
  // На случай возврата к project-page: PAGES_SUBDIR=1 → база /snake-game.
  if (process.env.PAGES_SUBDIR) {
    expo.experiments = { ...(expo.experiments || {}), baseUrl: '/snake-game' };
  }
  return { expo };
};
