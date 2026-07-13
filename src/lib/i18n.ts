// Локализация UI: 5 языков, лёгкий словарь без библиотек (по образцу settings.ts —
// sync-геттеры, загрузка один раз на старте). Первый запуск — язык системы
// (expo-localization), дальше — выбор пользователя в Settings (AsyncStorage).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

export type Lang = 'en' | 'ru' | 'es' | 'de' | 'pt';
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
];

const LANG_KEY = 'snake:lang';
let lang: Lang = 'en';

function systemLang(): Lang {
  try {
    const code = (getLocales()[0]?.languageCode || 'en').toLowerCase();
    if (code === 'ru' || code === 'be' || code === 'kk' || code === 'uk') return 'ru';
    if (code === 'es') return 'es';
    if (code === 'de') return 'de';
    if (code === 'pt') return 'pt';
  } catch {}
  return 'en';
}

export async function initI18n(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'ru' || saved === 'es' || saved === 'de' || saved === 'pt') {
      lang = saved;
    } else {
      lang = systemLang();
    }
  } catch {
    lang = systemLang();
  }
}

export const getLang = (): Lang => lang;

// Подписка на смену языка (B3): смонтированные экраны перерисовываются сразу,
// а не только после возврата в меню.
const listeners = new Set<() => void>();
export function subscribeLang(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
const notify = () => listeners.forEach((l) => l());

export async function setLang(v: Lang): Promise<void> {
  lang = v;
  notify();
  try {
    await AsyncStorage.setItem(LANG_KEY, v);
  } catch {}
}

type Entry = Record<Lang, string>;

const S = {
  // Меню
  tagline: { en: 'LAST SNAKE STANDING', ru: 'ПОСЛЕДНЯЯ ЗМЕЙКА В ОФИСЕ', es: 'LA ÚLTIMA SERPIENTE EN PIE', de: 'DIE LETZTE SCHLANGE GEWINNT', pt: 'A ÚLTIMA COBRA DE PÉ' },
  guestChip: { en: 'Guest · sign in to sync', ru: 'Гость · войди для синхронизации', es: 'Invitado · inicia sesión', de: 'Gast · anmelden zum Sync', pt: 'Convidado · entre p/ sincronizar' },
  daily: { en: 'Daily', ru: 'Бонус дня', es: 'Diario', de: 'Täglich', pt: 'Diário' },
  day: { en: 'Day', ru: 'День', es: 'Día', de: 'Tag', pt: 'Dia' },
  claim: { en: 'Claim', ru: 'Забрать', es: 'Reclamar', de: 'Abholen', pt: 'Resgatar' },
  best: { en: 'BEST', ru: 'РЕКОРД', es: 'RÉCORD', de: 'REKORD', pt: 'RECORDE' },
  play: { en: 'Play', ru: 'Играть', es: 'Jugar', de: 'Spielen', pt: 'Jogar' },
  versus: { en: 'Versus', ru: 'Дуэль', es: 'Versus', de: 'Versus', pt: 'Versus' },
  ranked: { en: 'Ranked', ru: 'Рейтинг', es: 'Clasificatoria', de: 'Rangliste', pt: 'Ranqueada' },
  party: { en: 'Office Royale (beta)', ru: 'Office Royale (бета)', es: 'Office Royale (beta)', de: 'Office Royale (Beta)', pt: 'Office Royale (beta)' },
  shop: { en: 'Shop', ru: 'Магазин', es: 'Tienda', de: 'Shop', pt: 'Loja' },
  leaderboard: { en: 'Leaderboard', ru: 'Лидеры', es: 'Clasificación', de: 'Bestenliste', pt: 'Classificação' },
  dailyQuests: { en: 'Daily quests', ru: 'Задания дня', es: 'Misiones diarias', de: 'Tagesquests', pt: 'Missões diárias' },
  howToPlay: { en: 'How to play', ru: 'Как играть', es: 'Cómo jugar', de: 'Spielanleitung', pt: 'Como jogar' },

  // Соло
  score: { en: 'SCORE', ru: 'СЧЁТ', es: 'PUNTOS', de: 'PUNKTE', pt: 'PONTOS' },
  menuBack: { en: '‹ Menu', ru: '‹ Меню', es: '‹ Menú', de: '‹ Menü', pt: '‹ Menu' },
  swipeHint: { en: 'Swipe anywhere or use the D-pad', ru: 'Свайп в любом месте или кнопки', es: 'Desliza o usa la cruceta', de: 'Wischen oder Steuerkreuz nutzen', pt: 'Deslize ou use o direcional' },
  keyboardHint: { en: 'Arrows / WASD', ru: 'Стрелки / WASD', es: 'Flechas / WASD', de: 'Pfeile / WASD', pt: 'Setas / WASD' },
  saveError: { en: 'Could not save the setting', ru: 'Не удалось сохранить настройку', es: 'No se pudo guardar el ajuste', de: 'Einstellung konnte nicht gespeichert werden', pt: 'Não foi possível salvar o ajuste' },
  updateTitle: { en: 'Update required', ru: 'Нужно обновление', es: 'Actualización necesaria', de: 'Update erforderlich', pt: 'Atualização necessária' },
  updateBody: { en: 'Please update to the latest version to keep playing.', ru: 'Обнови приложение до последней версии, чтобы продолжить.', es: 'Actualiza a la última versión para seguir jugando.', de: 'Bitte aktualisiere auf die neueste Version, um weiterzuspielen.', pt: 'Atualize para a versão mais recente para continuar jogando.' },
  updateNow: { en: 'Update now', ru: 'Обновить', es: 'Actualizar', de: 'Jetzt aktualisieren', pt: 'Atualizar' },
  paused: { en: 'Paused', ru: 'Пауза', es: 'Pausa', de: 'Pause', pt: 'Pausa' },
  resume: { en: 'Resume', ru: 'Продолжить', es: 'Continuar', de: 'Weiter', pt: 'Continuar' },
  gameOver: { en: 'Game over', ru: 'Игра окончена', es: 'Fin del juego', de: 'Game Over', pt: 'Fim de jogo' },
  ready: { en: 'Ready?', ru: 'Готов?', es: '¿Listo?', de: 'Bereit?', pt: 'Pronto?' },
  start: { en: 'Start', ru: 'Старт', es: 'Empezar', de: 'Start', pt: 'Começar' },
  again: { en: 'Again', ru: 'Ещё раз', es: 'Otra vez', de: 'Nochmal', pt: 'De novo' },
  shareScore: { en: 'Share score', ru: 'Поделиться', es: 'Compartir', de: 'Teilen', pt: 'Compartilhar' },
  linkCopied: { en: 'Link copied!', ru: 'Ссылка скопирована!', es: '¡Enlace copiado!', de: 'Link kopiert!', pt: 'Link copiado!' },

  // Магазин
  skins: { en: 'Skins', ru: 'Скины', es: 'Aspectos', de: 'Skins', pt: 'Skins' },
  getCoins: { en: 'Get coins', ru: 'Купить монеты', es: 'Conseguir monedas', de: 'Münzen kaufen', pt: 'Obter moedas' },
  coins: { en: 'coins', ru: 'монет', es: 'monedas', de: 'Münzen', pt: 'moedas' },
  free: { en: 'Free', ru: 'Бесплатно', es: 'Gratis', de: 'Gratis', pt: 'Grátis' },
  selected: { en: 'Selected', ru: 'Выбран', es: 'Elegido', de: 'Gewählt', pt: 'Escolhido' },
  select: { en: 'Select', ru: 'Выбрать', es: 'Elegir', de: 'Wählen', pt: 'Escolher' },
  buy: { en: 'Buy', ru: 'Купить', es: 'Comprar', de: 'Kaufen', pt: 'Comprar' },
  close: { en: 'Close', ru: 'Закрыть', es: 'Cerrar', de: 'Schließen', pt: 'Fechar' },

  // Настройки
  settings: { en: 'Settings', ru: 'Настройки', es: 'Ajustes', de: 'Einstellungen', pt: 'Ajustes' },
  sound: { en: 'Sound', ru: 'Звук', es: 'Sonido', de: 'Ton', pt: 'Som' },
  soundDesc: { en: 'Game sound effects', ru: 'Звуковые эффекты игры', es: 'Efectos de sonido', de: 'Soundeffekte', pt: 'Efeitos sonoros' },
  haptics: { en: 'Haptics', ru: 'Вибрация', es: 'Vibración', de: 'Haptik', pt: 'Vibração' },
  hapticsDesc: { en: 'Vibration feedback (device only)', ru: 'Виброотклик (на устройстве)', es: 'Respuesta háptica (solo móvil)', de: 'Vibrationsfeedback (nur Gerät)', pt: 'Resposta tátil (só no aparelho)' },
  colorblind: { en: 'Color-blind shapes', ru: 'Формы для дальтоников', es: 'Formas p/ daltónicos', de: 'Formen f. Farbenblinde', pt: 'Formas p/ daltônicos' },
  colorblindDesc: { en: 'Distinct food shapes in duels (square = rival)', ru: 'Разные формы еды в дуэли (квадрат = чужая)', es: 'Formas distintas en duelos (cuadrado = rival)', de: 'Futterformen im Duell (Quadrat = Gegner)', pt: 'Formas na comida em duelos (quadrado = rival)' },
  controls: { en: 'Controls', ru: 'Управление', es: 'Controles', de: 'Steuerung', pt: 'Controles' },
  controlsDesc: { en: 'Swipe works everywhere in every scheme', ru: 'Свайп работает всегда в любой схеме', es: 'Deslizar funciona siempre', de: 'Wischen geht immer', pt: 'Deslizar funciona sempre' },
  ctrlDpad: { en: 'D-pad', ru: 'Кнопки', es: 'Cruceta', de: 'Steuerkreuz', pt: 'Direcional' },
  ctrlSplit: { en: 'Split', ru: 'Двумя руками', es: 'Dividido', de: 'Geteilt', pt: 'Dividido' },
  ctrlSwipe: { en: 'Swipe', ru: 'Свайп', es: 'Deslizar', de: 'Wischen', pt: 'Deslizar' },
  dpadPos: { en: 'D-pad position', ru: 'Положение кнопок', es: 'Posición de cruceta', de: 'Position Steuerkreuz', pt: 'Posição do direcional' },
  dpadPosDesc: { en: 'Dock to a side for one-handed play', ru: 'Прижать к краю для игры одной рукой', es: 'Al borde para jugar con una mano', de: 'Am Rand für Einhandspiel', pt: 'Na borda p/ jogar com uma mão' },
  left: { en: 'Left', ru: 'Слева', es: 'Izquierda', de: 'Links', pt: 'Esquerda' },
  center: { en: 'Center', ru: 'По центру', es: 'Centro', de: 'Mitte', pt: 'Centro' },
  right: { en: 'Right', ru: 'Справа', es: 'Derecha', de: 'Rechts', pt: 'Direita' },
  language: { en: 'Language', ru: 'Язык', es: 'Idioma', de: 'Sprache', pt: 'Idioma' },
  back: { en: 'Back', ru: 'Назад', es: 'Atrás', de: 'Zurück', pt: 'Voltar' },

  // Онбординг
  ob1Title: { en: 'Two snakes. One survivor.', ru: 'Две змейки. Один выживший.', es: 'Dos serpientes. Un superviviente.', de: 'Zwei Schlangen. Ein Überlebender.', pt: 'Duas cobras. Um sobrevivente.' },
  ob1Body: { en: 'Shake Work Off is a fast color duel. Outlast your rival to win the round — best of 3.', ru: 'Shake Work Off — быстрая цветовая дуэль. Переживи соперника, чтобы взять раунд. До 2 побед.', es: 'Shake Work Off es un duelo de colores. Sobrevive a tu rival para ganar la ronda — al mejor de 3.', de: 'Shake Work Off ist ein schnelles Farbduell. Überlebe deinen Gegner und gewinne die Runde — Best of 3.', pt: 'Shake Work Off é um duelo de cores. Sobreviva ao rival para vencer a rodada — melhor de 3.' },
  ob2Title: { en: 'Eat ONLY your color', ru: 'Ешь ТОЛЬКО свой цвет', es: 'Come SOLO tu color', de: 'Friss NUR deine Farbe', pt: 'Coma SÓ a sua cor' },
  ob2Body: { en: 'Your color feeds and grows you. The other color is instant death. Touch a wall or your rival and you lose too.', ru: 'Свой цвет кормит и растит. Чужой цвет — мгновенная смерть. Стена или соперник — тоже проигрыш.', es: 'Tu color te alimenta. El otro color es muerte instantánea. Muro o rival también es derrota.', de: 'Deine Farbe macht dich stark. Die andere Farbe ist der sofortige Tod. Wand oder Gegner heißt auch verloren.', pt: 'Sua cor alimenta e faz crescer. A outra cor é morte na hora. Parede ou rival também é derrota.' },
  ob3Title: { en: 'Grab the gold ⚡', ru: 'Хватай золото ⚡', es: 'Toma el oro ⚡', de: 'Schnapp dir Gold ⚡', pt: 'Pegue o ouro ⚡' },
  ob3Body: { en: 'Gold food gives a speed burst. Race ahead, cut your rival off and force them to crash. Rounds end only on a crash.', ru: 'Золотая еда даёт рывок скорости. Вырвись вперёд, подрежь соперника и заставь его врезаться. Раунд кончается только крашем.', es: 'La comida dorada da velocidad. Adelanta, corta el paso y haz que tu rival choque. La ronda acaba solo con un choque.', de: 'Goldenes Futter gibt Tempo. Zieh vorbei, schneide den Gegner und zwing ihn zum Crash. Runden enden nur durch Crash.', pt: 'Comida dourada dá velocidade. Ultrapasse, corte o rival e force a batida. A rodada só acaba com um crash.' },
  ob4Title: { en: 'Climb & carry your progress', ru: 'Расти в рейтинге и сохраняй прогресс', es: 'Sube y guarda tu progreso', de: 'Steig auf und sichere deinen Fortschritt', pt: 'Suba e leve seu progresso' },
  ob4Body: { en: 'Win ranked matches to rank up. Sign in with your email to sync coins, skins and rating across all your devices.', ru: 'Побеждай в рейтинговых матчах и поднимайся. Войди по email — монеты, скины и рейтинг будут на всех устройствах.', es: 'Gana partidas clasificatorias para subir. Inicia sesión con tu email para sincronizar monedas, aspectos y rating.', de: 'Gewinne Ranglistenspiele. Melde dich per E-Mail an, um Münzen, Skins und Rating überall zu haben.', pt: 'Vença ranqueadas para subir. Entre com seu e-mail para sincronizar moedas, skins e rating.' },
  obEat: { en: '✓ eat', ru: '✓ ешь', es: '✓ come', de: '✓ fressen', pt: '✓ coma' },
  obDeath: { en: '✕ death', ru: '✕ смерть', es: '✕ muerte', de: '✕ Tod', pt: '✕ morte' },
  skip: { en: 'Skip', ru: 'Пропустить', es: 'Saltar', de: 'Überspringen', pt: 'Pular' },
  next: { en: 'Next', ru: 'Дальше', es: 'Siguiente', de: 'Weiter', pt: 'Próximo' },
  letsPlay: { en: "Let's play", ru: 'Играем!', es: '¡A jugar!', de: 'Los geht’s', pt: 'Vamos jogar' },

  // Аккаунт
  account: { en: 'Account', ru: 'Аккаунт', es: 'Cuenta', de: 'Konto', pt: 'Conta' },
  signedInLabel: { en: 'SIGNED IN', ru: 'ВЫ ВОШЛИ', es: 'CONECTADO', de: 'ANGEMELDET', pt: 'CONECTADO' },
  guestLabel: { en: 'GUEST', ru: 'ГОСТЬ', es: 'INVITADO', de: 'GAST', pt: 'CONVIDADO' },
  syncHint: { en: 'Your rating and progress sync on every device with this email.', ru: 'Рейтинг и прогресс синхронизируются на всех устройствах с этим email.', es: 'Tu rating y progreso se sincronizan en todos los dispositivos con este email.', de: 'Rating und Fortschritt werden auf allen Geräten mit dieser E-Mail synchronisiert.', pt: 'Seu rating e progresso sincronizam em todos os aparelhos com este e-mail.' },
  guestHint: { en: 'Sign in with email to save your progress and continue on any device (phone, browser).', ru: 'Войди по email, чтобы сохранить прогресс и продолжать на любом устройстве (телефон, браузер).', es: 'Inicia sesión con email para guardar tu progreso y seguir en cualquier dispositivo.', de: 'Melde dich per E-Mail an, um deinen Fortschritt zu sichern und überall weiterzuspielen.', pt: 'Entre com e-mail para salvar o progresso e continuar em qualquer aparelho.' },
  enterValidEmail: { en: 'Enter a valid email', ru: 'Введи корректный email', es: 'Introduce un email válido', de: 'Gültige E-Mail eingeben', pt: 'Digite um e-mail válido' },
  codeSent: { en: 'Code sent — check your email.', ru: 'Код отправлен — проверь почту.', es: 'Código enviado — revisa tu correo.', de: 'Code gesendet — prüfe deine E-Mails.', pt: 'Código enviado — veja seu e-mail.' },
  codeSendFail: { en: 'Could not send the code. Please try again shortly.', ru: 'Не удалось отправить код. Попробуй чуть позже.', es: 'No se pudo enviar el código. Inténtalo de nuevo.', de: 'Code konnte nicht gesendet werden. Versuch es gleich nochmal.', pt: 'Não foi possível enviar o código. Tente de novo em instantes.' },
  enterCode: { en: 'Enter the code from the email', ru: 'Введи код из письма', es: 'Introduce el código del correo', de: 'Code aus der E-Mail eingeben', pt: 'Digite o código do e-mail' },
  signedInMsg: { en: 'Signed in! Taking you back…', ru: 'Вход выполнен! Возвращаемся…', es: '¡Sesión iniciada! Volviendo…', de: 'Angemeldet! Zurück geht’s…', pt: 'Conectado! Voltando…' },
  invalidCode: { en: 'Invalid or expired code.', ru: 'Код неверный или устарел.', es: 'Código inválido o caducado.', de: 'Code ungültig oder abgelaufen.', pt: 'Código inválido ou expirado.' },
  deleteWarn: { en: 'This permanently deletes your account and all progress. Tap again to confirm.', ru: 'Аккаунт и весь прогресс будут удалены навсегда. Нажми ещё раз для подтверждения.', es: 'Esto borra tu cuenta y todo el progreso para siempre. Toca de nuevo para confirmar.', de: 'Konto und Fortschritt werden dauerhaft gelöscht. Zum Bestätigen erneut tippen.', pt: 'Isso apaga sua conta e todo o progresso para sempre. Toque de novo para confirmar.' },
  deleteFail: { en: 'Could not delete the account.', ru: 'Не удалось удалить аккаунт.', es: 'No se pudo borrar la cuenta.', de: 'Konto konnte nicht gelöscht werden.', pt: 'Não foi possível excluir a conta.' },
  signOut: { en: 'Sign out', ru: 'Выйти', es: 'Cerrar sesión', de: 'Abmelden', pt: 'Sair' },
  signingOut: { en: 'Signing out…', ru: 'Выходим…', es: 'Cerrando sesión…', de: 'Wird abgemeldet…', pt: 'Saindo…' },
  sendCodeBtn: { en: 'Send code', ru: 'Отправить код', es: 'Enviar código', de: 'Code senden', pt: 'Enviar código' },
  sending: { en: 'Sending…', ru: 'Отправляем…', es: 'Enviando…', de: 'Wird gesendet…', pt: 'Enviando…' },
  resendIn: { en: 'Resend in', ru: 'Повтор через', es: 'Reenviar en', de: 'Erneut in', pt: 'Reenviar em' },
  verifying: { en: 'Verifying…', ru: 'Проверяем…', es: 'Verificando…', de: 'Wird geprüft…', pt: 'Verificando…' },
  verifySignIn: { en: 'Verify & sign in', ru: 'Подтвердить и войти', es: 'Verificar y entrar', de: 'Prüfen & anmelden', pt: 'Verificar e entrar' },
  codePlaceholder: { en: 'Code from email', ru: 'Код из письма', es: 'Código del correo', de: 'Code aus der E-Mail', pt: 'Código do e-mail' },
  useDifferentEmail: { en: 'Use a different email', ru: 'Другой email', es: 'Usar otro email', de: 'Andere E-Mail', pt: 'Usar outro e-mail' },
  privacyPolicy: { en: 'Privacy Policy', ru: 'Конфиденциальность', es: 'Privacidad', de: 'Datenschutz', pt: 'Privacidade' },
  deleteAccount: { en: 'Delete account', ru: 'Удалить аккаунт', es: 'Borrar cuenta', de: 'Konto löschen', pt: 'Excluir conta' },
  confirmDelete: { en: 'Confirm delete', ru: 'Подтвердить удаление', es: 'Confirmar borrado', de: 'Löschen bestätigen', pt: 'Confirmar exclusão' },

  // Лидерборд
  lbEmpty: { en: 'No players yet — play a ranked match!', ru: 'Пока нет игроков — сыграй рейтинговый матч!', es: 'Aún no hay jugadores — ¡juega una clasificatoria!', de: 'Noch keine Spieler — spiel ein Ranglistenmatch!', pt: 'Ainda sem jogadores — jogue uma ranqueada!' },
  refresh: { en: 'Refresh', ru: 'Обновить', es: 'Actualizar', de: 'Aktualisieren', pt: 'Atualizar' },

  // Квесты (шаблон: {t} = цель)
  questsTitle: { en: 'Daily quests', ru: 'Задания дня', es: 'Misiones diarias', de: 'Tagesquests', pt: 'Missões diárias' },
  qSoloScore: { en: 'Score {t} in one solo run', ru: 'Набери {t} за один соло-заход', es: 'Consigue {t} en una partida solo', de: 'Erziele {t} in einem Solo-Lauf', pt: 'Faça {t} numa partida solo' },
  qEatSolo: { en: 'Eat {t} food in solo', ru: 'Съешь {t} еды в соло', es: 'Come {t} comidas en solo', de: 'Friss {t} Futter im Solo', pt: 'Coma {t} comidas no solo' },
  qWinRanked: { en: 'Win {t} ranked duels', ru: 'Выиграй {t} рейтинговых дуэли', es: 'Gana {t} duelos clasificatorios', de: 'Gewinne {t} Ranglistenduelle', pt: 'Vença {t} duelos ranqueados' },
  qPlayRanked: { en: 'Play {t} ranked duels', ru: 'Сыграй {t} рейтинговых дуэли', es: 'Juega {t} duelos clasificatorios', de: 'Spiele {t} Ranglistenduelle', pt: 'Jogue {t} duelos ranqueados' },
  done: { en: 'Done', ru: 'Готово', es: 'Listo', de: 'Fertig', pt: 'Feito' },

  // Дуэль — лобби
  colorDuel: { en: 'Color Duel', ru: 'Цветовая дуэль', es: 'Duelo de colores', de: 'Farbduell', pt: 'Duelo de cores' },
  roomNotFound: { en: 'Room not found', ru: 'Комната не найдена', es: 'Sala no encontrada', de: 'Raum nicht gefunden', pt: 'Sala não encontrada' },
  roomNotFoundHint: { en: "A friend's room stays active only while they keep Shake Work Off open on the invite screen. Ask them to tap \"Play with a friend\" again — or:", ru: 'Комната друга живёт, только пока у него открыт экран приглашения. Попроси его снова нажать «Играть с другом» — или:', es: 'La sala de tu amigo solo vive mientras tenga abierta la pantalla de invitación. Pídele que pulse «Jugar con un amigo» otra vez — o:', de: 'Der Raum bleibt nur aktiv, solange dein Freund den Einladungsbildschirm offen hat. Bitte ihn, erneut „Mit Freund spielen“ zu tippen — oder:', pt: 'A sala do amigo só fica ativa enquanto ele mantém a tela de convite aberta. Peça para tocar em «Jogar com um amigo» de novo — ou:' },
  tryAgain: { en: 'Try again', ru: 'Попробовать снова', es: 'Reintentar', de: 'Nochmal versuchen', pt: 'Tentar de novo' },
  playVsBot: { en: 'Play vs bot', ru: 'Играть с ботом', es: 'Jugar vs bot', de: 'Gegen Bot spielen', pt: 'Jogar vs bot' },
  opponentFound: { en: 'Opponent found! Starting…', ru: 'Соперник найден! Начинаем…', es: '¡Rival encontrado! Empezando…', de: 'Gegner gefunden! Los geht’s…', pt: 'Rival encontrado! Começando…' },
  findingOpponent: { en: 'Finding a ranked opponent…', ru: 'Ищем соперника по рейтингу…', es: 'Buscando rival clasificatorio…', de: 'Suche Ranglistengegner…', pt: 'Procurando rival ranqueado…' },
  cancel: { en: 'Cancel', ru: 'Отмена', es: 'Cancelar', de: 'Abbrechen', pt: 'Cancelar' },
  quickMatch: { en: 'Quick match', ru: 'Быстрый матч', es: 'Partida rápida', de: 'Schnelles Match', pt: 'Partida rápida' },
  randomOpponent: { en: 'random opponent', ru: 'случайный соперник', es: 'rival aleatorio', de: 'zufälliger Gegner', pt: 'rival aleatório' },
  playWithFriend: { en: 'Play with a friend', ru: 'Играть с другом', es: 'Jugar con un amigo', de: 'Mit Freund spielen', pt: 'Jogar com um amigo' },
  join: { en: 'Join', ru: 'Войти', es: 'Unirse', de: 'Beitreten', pt: 'Entrar' },
  searchingOpponent: { en: 'Searching for an opponent…', ru: 'Ищем соперника…', es: 'Buscando rival…', de: 'Suche Gegner…', pt: 'Procurando rival…' },
  roomCode: { en: 'Room code', ru: 'Код комнаты', es: 'Código de sala', de: 'Raumcode', pt: 'Código da sala' },
  challengeFriendBtn: { en: 'Challenge a friend', ru: 'Вызвать друга', es: 'Reta a un amigo', de: 'Freund herausfordern', pt: 'Desafiar um amigo' },
  copyInviteLink: { en: 'Copy invite link', ru: 'Скопировать ссылку', es: 'Copiar enlace', de: 'Link kopieren', pt: 'Copiar link' },
  sendCodeHint: { en: 'Send the code or link to a friend', ru: 'Отправь код или ссылку другу', es: 'Envía el código o enlace a un amigo', de: 'Schick den Code oder Link an einen Freund', pt: 'Envie o código ou link a um amigo' },
  keepOpenHint: { en: 'Keep this screen open until they join', ru: 'Держи экран открытым, пока друг не зайдёт', es: 'Mantén esta pantalla abierta hasta que entre', de: 'Bildschirm offen lassen, bis er beitritt', pt: 'Mantenha esta tela aberta até ele entrar' },
  connecting: { en: 'Connecting…', ru: 'Подключаемся…', es: 'Conectando…', de: 'Verbinde…', pt: 'Conectando…' },
  waitingOpponent: { en: 'Waiting for opponent…', ru: 'Ждём соперника…', es: 'Esperando al rival…', de: 'Warte auf Gegner…', pt: 'Esperando o rival…' },
  opponentJoined: { en: 'Opponent joined!', ru: 'Соперник зашёл!', es: '¡Rival conectado!', de: 'Gegner ist da!', pt: 'Rival entrou!' },
  waitingHost: { en: 'Waiting for host to start…', ru: 'Ждём, когда хост начнёт…', es: 'Esperando al anfitrión…', de: 'Warte auf den Host…', pt: 'Esperando o anfitrião…' },
  connectionError: { en: 'Connection error', ru: 'Ошибка соединения', es: 'Error de conexión', de: 'Verbindungsfehler', pt: 'Erro de conexão' },
  rules1: { en: 'Eat only YOUR color. Eating the other color = you lose.', ru: 'Ешь только СВОЙ цвет. Съел чужой — проиграл.', es: 'Come solo TU color. Comer el otro color = pierdes.', de: 'Friss nur DEINE Farbe. Andere Farbe = verloren.', pt: 'Coma só a SUA cor. Comer a outra cor = derrota.' },
  rules2: { en: 'Avoid walls and the opponent. Best of 3 rounds.', ru: 'Избегай стен и соперника. До 2 побед из 3 раундов.', es: 'Evita muros y rival. Al mejor de 3 rondas.', de: 'Meide Wände und Gegner. Best of 3 Runden.', pt: 'Evite paredes e o rival. Melhor de 3 rodadas.' },

  // Дуэль — матч
  you: { en: 'You', ru: 'Ты', es: 'Tú', de: 'Du', pt: 'Você' },
  oppLabel: { en: 'Opp', ru: 'Против', es: 'Rival', de: 'Gegner', pt: 'Rival' },
  round: { en: 'Round', ru: 'Раунд', es: 'Ronda', de: 'Runde', pt: 'Rodada' },
  dontCrash: { en: "don't crash", ru: 'не врежься', es: 'no choques', de: 'nicht crashen', pt: 'não bata' },
  youAreEat: { en: 'You are {c} — eat {c} food', ru: 'Ты — {c}: ешь еду цвета {c}', es: 'Eres {c} — come comida {c}', de: 'Du bist {c} — friss {c}-Futter', pt: 'Você é {c} — coma comida {c}' },
  colorRed: { en: 'Red', ru: 'Красный', es: 'Rojo', de: 'Rot', pt: 'Vermelho' },
  colorBlue: { en: 'Blue', ru: 'Синий', es: 'Azul', de: 'Blau', pt: 'Azul' },
  ptsSuffix: { en: 'pts', ru: 'очк.', es: 'pts', de: 'Pkt.', pt: 'pts' },
  thisRound: { en: 'this round', ru: 'в раунде', es: 'esta ronda', de: 'diese Runde', pt: 'nesta rodada' },
  draw: { en: 'Draw!', ru: 'Ничья!', es: '¡Empate!', de: 'Unentschieden!', pt: 'Empate!' },
  roundWon: { en: 'Round won!', ru: 'Раунд выигран!', es: '¡Ronda ganada!', de: 'Runde gewonnen!', pt: 'Rodada vencida!' },
  roundLost: { en: 'Round lost', ru: 'Раунд проигран', es: 'Ronda perdida', de: 'Runde verloren', pt: 'Rodada perdida' },
  nextRound: { en: 'Next round…', ru: 'Следующий раунд…', es: 'Siguiente ronda…', de: 'Nächste Runde…', pt: 'Próxima rodada…' },
  connectionLost: { en: 'Connection lost', ru: 'Связь потеряна', es: 'Conexión perdida', de: 'Verbindung verloren', pt: 'Conexão perdida' },
  reconnecting: { en: 'Reconnecting…', ru: 'Переподключаемся…', es: 'Reconectando…', de: 'Neu verbinden…', pt: 'Reconectando…' },
  leave: { en: 'Leave', ru: 'Выйти', es: 'Salir', de: 'Verlassen', pt: 'Sair' },
  youWin: { en: 'You win!', ru: 'Победа!', es: '¡Ganaste!', de: 'Gewonnen!', pt: 'Você venceu!' },
  youLose: { en: 'You lose', ru: 'Поражение', es: 'Perdiste', de: 'Verloren', pt: 'Você perdeu' },
  itsADraw: { en: "It's a draw", ru: 'Ничья', es: 'Empate', de: 'Unentschieden', pt: 'Empate' },
  forfeitWin: { en: 'Opponent left — you win by forfeit', ru: 'Соперник вышел — победа тебе', es: 'El rival se fue — ganas por abandono', de: 'Gegner weg — Sieg durch Aufgabe', pt: 'O rival saiu — vitória por W.O.' },
  playAgain: { en: 'Play again', ru: 'Сыграть ещё', es: 'Jugar otra vez', de: 'Nochmal spielen', pt: 'Jogar de novo' },
  shareResultBtn: { en: 'Share result', ru: 'Поделиться', es: 'Compartir', de: 'Teilen', pt: 'Compartilhar' },

  // Office Royale (party)
  practice: { en: 'Practice', ru: 'Тренировка', es: 'Práctica', de: 'Training', pt: 'Treino' },
  practiceSub: { en: 'Last snake standing — vs bots (local)', ru: 'Последняя змейка — против ботов (локально)', es: 'La última serpiente — vs bots (local)', de: 'Letzte Schlange — gegen Bots (lokal)', pt: 'Última cobra de pé — vs bots (local)' },
  players: { en: 'players', ru: 'игроков', es: 'jugadores', de: 'Spieler', pt: 'jogadores' },
  teamRoom: { en: 'Team room', ru: 'Командная комната', es: 'Sala de equipo', de: 'Team-Raum', pt: 'Sala da equipe' },
  teamRoomSub: { en: "Gather your team (5–10) — winner doesn't work today", ru: 'Собери команду (5–10) — победитель сегодня не работает', es: 'Reúne a tu equipo (5–10) — el ganador no trabaja hoy', de: 'Sammle dein Team (5–10) — der Sieger arbeitet heute nicht', pt: 'Reúna a equipe (5–10) — quem vencer não trabalha hoje' },
  connErrRetry: { en: 'Connection error — try again', ru: 'Ошибка соединения — попробуй ещё', es: 'Error de conexión — reintenta', de: 'Verbindungsfehler — nochmal', pt: 'Erro de conexão — tente de novo' },
  yourName: { en: 'Your name', ru: 'Твоё имя', es: 'Tu nombre', de: 'Dein Name', pt: 'Seu nome' },
  createTeamRoom: { en: 'Create team room', ru: 'Создать комнату', es: 'Crear sala', de: 'Raum erstellen', pt: 'Criar sala' },
  shareCodeTeam: { en: 'Share the code or link with your team', ru: 'Отправь код или ссылку команде', es: 'Comparte el código o enlace con tu equipo', de: 'Teile Code oder Link mit deinem Team', pt: 'Compartilhe o código ou link com a equipe' },
  keepOpenTeam: { en: 'Keep this screen open until everyone joins', ru: 'Держи экран открытым, пока все не зайдут', es: 'Mantén la pantalla abierta hasta que entren todos', de: 'Bildschirm offen lassen, bis alle da sind', pt: 'Mantenha a tela aberta até todos entrarem' },
  onTheLineLabel: { en: "On the line — winner's reward", ru: 'На кону — приз победителя', es: 'En juego — premio del ganador', de: 'Auf dem Spiel — Siegerprämie', pt: 'Em jogo — prêmio do vencedor' },
  stakePlaceholder: { en: "e.g. doesn't work today", ru: 'напр. сегодня не работает', es: 'ej. no trabaja hoy', de: 'z.B. arbeitet heute nicht', pt: 'ex. não trabalha hoje' },
  startMatch: { en: 'Start match', ru: 'Начать матч', es: 'Empezar partida', de: 'Match starten', pt: 'Começar partida' },
  needPlayers: { en: 'Need {n}+ players', ru: 'Нужно {n}+ игроков', es: 'Faltan jugadores ({n}+)', de: 'Mind. {n} Spieler nötig', pt: 'Precisa de {n}+ jogadores' },
  partySub: { en: "Last snake standing — winner doesn't work today", ru: 'Последняя змейка в офисе — победитель сегодня не работает', es: 'La última serpiente — el ganador no trabaja hoy', de: 'Letzte Schlange — der Sieger arbeitet heute nicht', pt: 'Última cobra de pé — quem vencer não trabalha hoje' },
  teamRoomBtn: { en: 'Team room (5–10)', ru: 'Командная комната (5–10)', es: 'Sala de equipo (5–10)', de: 'Team-Raum (5–10)', pt: 'Sala da equipe (5–10)' },
  practiceVsBots: { en: 'Practice vs bots', ru: 'Тренировка с ботами', es: 'Práctica vs bots', de: 'Training gegen Bots', pt: 'Treino vs bots' },
  youChip: { en: 'YOU', ru: 'ТЫ', es: 'TÚ', de: 'DU', pt: 'VOCÊ' },
  aliveChip: { en: 'ALIVE', ru: 'В ИГРЕ', es: 'VIVOS', de: 'LEBEND', pt: 'VIVOS' },
  aliveWord: { en: 'alive', ru: 'жив', es: 'vivo', de: 'lebt', pt: 'vivo' },
  winShort: { en: 'win', ru: 'побед', es: 'vict.', de: 'Siege', pt: 'vit.' },
  onTheLine: { en: 'On the line', ru: 'На кону', es: 'En juego', de: 'Auf dem Spiel', pt: 'Em jogo' },
  spectating: { en: 'Spectating — match in progress', ru: 'Наблюдаешь — матч идёт', es: 'Espectador — partida en curso', de: 'Zuschauer — Match läuft', pt: 'Assistindo — partida em andamento' },
  swipeOrDpad: { en: 'Swipe or D-pad — eat to grow, outlast everyone', ru: 'Свайп или кнопки — ешь, расти и переживи всех', es: 'Desliza o cruceta — come, crece y sobrevive', de: 'Wischen oder Steuerkreuz — friss und überlebe alle', pt: 'Deslize ou direcional — coma, cresça e sobreviva' },
  youAreOut: { en: 'You are out — watch who wins', ru: 'Ты выбыл — смотри, кто победит', es: 'Estás fuera — mira quién gana', de: 'Du bist raus — schau, wer gewinnt', pt: 'Você saiu — veja quem vence' },
  roundDraw: { en: 'Round draw', ru: 'Ничья в раунде', es: 'Ronda empatada', de: 'Runde unentschieden', pt: 'Rodada empatada' },
  youWonRound: { en: 'You won the round! 🟢', ru: 'Ты выиграл раунд! 🟢', es: '¡Ganaste la ronda! 🟢', de: 'Runde gewonnen! 🟢', pt: 'Você venceu a rodada! 🟢' },
  wonTheRound: { en: 'won the round', ru: 'выиграл раунд', es: 'ganó la ronda', de: 'gewann die Runde', pt: 'venceu a rodada' },
  firstTo: { en: 'First to', ru: 'До', es: 'Primero a', de: 'Zuerst auf', pt: 'Primeiro a' },
  dontWorkToday: { en: "You don't work today! 🎉", ru: 'Сегодня ты не работаешь! 🎉', es: '¡Hoy no trabajas! 🎉', de: 'Heute arbeitest du nicht! 🎉', pt: 'Hoje você não trabalha! 🎉' },
  winsWord: { en: 'wins', ru: 'побеждает', es: 'gana', de: 'gewinnt', pt: 'vence' },
  youPlaced: { en: 'You placed #{n} this round', ru: 'Твоё место в раунде — #{n}', es: 'Quedaste #{n} en esta ronda', de: 'Du wurdest #{n} in dieser Runde', pt: 'Você ficou em #{n} nesta rodada' },
  youSuffix: { en: '(you)', ru: '(ты)', es: '(tú)', de: '(du)', pt: '(você)' },
  invitedToTeam: { en: "You're invited to team {c} — enter your name, then Join", ru: 'Тебя позвали в команду {c} — введи имя и жми «Войти»', es: 'Te invitaron al equipo {c} — pon tu nombre y únete', de: 'Du bist ins Team {c} eingeladen — Name eingeben und beitreten', pt: 'Você foi convidado ao time {c} — digite o nome e entre' },
  playersLabel: { en: 'Players', ru: 'Игроки', es: 'Jugadores', de: 'Spieler', pt: 'Jogadores' },
  openSlot: { en: 'Open', ru: 'Свободно', es: 'Libre', de: 'Frei', pt: 'Livre' },
  hostSuffix: { en: '· host', ru: '· хост', es: '· anfitrión', de: '· Host', pt: '· anfitrião' },
  shareInviteLink: { en: '🔗 Share invite link', ru: '🔗 Отправить приглашение', es: '🔗 Compartir invitación', de: '🔗 Einladungslink teilen', pt: '🔗 Compartilhar convite' },
  stake1: { en: "doesn't work today", ru: 'сегодня не работает', es: 'no trabaja hoy', de: 'arbeitet heute nicht', pt: 'não trabalha hoje' },
  stake2: { en: 'skips standup', ru: 'пропускает планёрку', es: 'se salta la daily', de: 'lässt das Standup aus', pt: 'pula a daily' },
  stake3: { en: 'no chores today', ru: 'без рутины сегодня', es: 'sin tareas hoy', de: 'heute keine Pflichten', pt: 'sem tarefas hoje' },
  stake4: { en: 'picks lunch', ru: 'выбирает обед', es: 'elige el almuerzo', de: 'wählt das Mittagessen', pt: 'escolhe o almoço' },

  // Онбординг — визуальные плашки
  obSpeed: { en: 'SPEED ×2', ru: 'СКОРОСТЬ ×2', es: 'VELOCIDAD ×2', de: 'TEMPO ×2', pt: 'VELOCIDADE ×2' },
  obRanked: { en: 'RANKED', ru: 'РЕЙТИНГ', es: 'CLASIFICATORIA', de: 'RANGLISTE', pt: 'RANQUEADA' },

  // Имена по умолчанию (party)
  botName: { en: 'Bot {n}', ru: 'Бот {n}', es: 'Bot {n}', de: 'Bot {n}', pt: 'Bot {n}' },
  playerName: { en: 'Player {n}', ru: 'Игрок {n}', es: 'Jugador {n}', de: 'Spieler {n}', pt: 'Jogador {n}' },
  nobody: { en: 'Nobody', ru: 'Никто', es: 'Nadie', de: 'Niemand', pt: 'Ninguém' },

  // Лидерборд
  wlShort: { en: '{w}W {l}L', ru: '{w}В {l}П', es: '{w}V {l}D', de: '{w}S {l}N', pt: '{w}V {l}D' },

  // Плейсхолдеры
  emailPlaceholder: { en: 'you@email.com', ru: 'имя@почта.ru', es: 'tu@email.com', de: 'du@email.de', pt: 'voce@email.com' },
  codePlaceholderShort: { en: 'CODE', ru: 'КОД', es: 'COD', de: 'CODE', pt: 'COD' },

  // Share-тексты (русский игрок шерит в русский чат)
  shareSolo: { en: 'I scored {s} in Shake Work Off 🐍 — can you beat it?', ru: 'Я набрал {s} в Shake Work Off 🐍 — сможешь больше?', es: 'Hice {s} en Shake Work Off 🐍 — ¿puedes superarlo?', de: 'Ich habe {s} in Shake Work Off geholt 🐍 — schaffst du mehr?', pt: 'Fiz {s} no Shake Work Off 🐍 — consegue mais?' },
  shareDuelWin: { en: 'I won {a}:{b} in Shake Work Off ⚡ — challenge me!', ru: 'Я выиграл {a}:{b} в Shake Work Off ⚡ — вызови меня!', es: 'Gané {a}:{b} en Shake Work Off ⚡ — ¡rétame!', de: 'Ich habe {a}:{b} in Shake Work Off gewonnen ⚡ — fordere mich heraus!', pt: 'Venci {a}:{b} no Shake Work Off ⚡ — me desafie!' },
  shareDuelLoss: { en: 'I just battled in Shake Work Off ⚡ — can you do better?', ru: 'Я сразился в Shake Work Off ⚡ — сможешь лучше?', es: 'Acabo de luchar en Shake Work Off ⚡ — ¿lo haces mejor?', de: 'Ich habe gerade in Shake Work Off gekämpft ⚡ — kannst du es besser?', pt: 'Acabei de batalhar no Shake Work Off ⚡ — faz melhor?' },
  shareChallenge: { en: 'Beat me 1v1 in Shake Work Off ⚡', ru: 'Обыграй меня 1 на 1 в Shake Work Off ⚡', es: 'Gáname 1v1 en Shake Work Off ⚡', de: 'Schlag mich 1v1 in Shake Work Off ⚡', pt: 'Me vença 1v1 no Shake Work Off ⚡' },
  sharePartyInvite: { en: 'Join my team in Shake Work Off — winner skips work today! 🐍', ru: 'Заходи в мою команду в Shake Work Off — победитель сегодня не работает! 🐍', es: 'Únete a mi equipo en Shake Work Off — ¡el ganador no trabaja hoy! 🐍', de: 'Komm in mein Team bei Shake Work Off — der Sieger arbeitet heute nicht! 🐍', pt: 'Entre no meu time no Shake Work Off — quem vencer não trabalha hoje! 🐍' },
  sharePartyWinStake: { en: 'I won Shake Work Off — {stake}! 🎉', ru: 'Я выиграл Shake Work Off — {stake}! 🎉', es: 'Gané Shake Work Off — ¡{stake}! 🎉', de: 'Ich habe Shake Work Off gewonnen — {stake}! 🎉', pt: 'Venci o Shake Work Off — {stake}! 🎉' },
  sharePartyWin: { en: "I won Shake Work Off — I don't work today! 🎉", ru: 'Я выиграл Shake Work Off — сегодня не работаю! 🎉', es: 'Gané Shake Work Off — ¡hoy no trabajo! 🎉', de: 'Ich habe Shake Work Off gewonnen — heute arbeite ich nicht! 🎉', pt: 'Venci o Shake Work Off — hoje não trabalho! 🎉' },
  sharePartyLossStake: { en: '{winner} won Shake Work Off — {stake} 🐍', ru: '{winner} выиграл Shake Work Off — {stake} 🐍', es: '{winner} ganó Shake Work Off — {stake} 🐍', de: '{winner} hat Shake Work Off gewonnen — {stake} 🐍', pt: '{winner} venceu o Shake Work Off — {stake} 🐍' },
  sharePartyLoss: { en: '{winner} won our Shake Work Off match 🐍', ru: '{winner} выиграл наш матч в Shake Work Off 🐍', es: '{winner} ganó nuestra partida de Shake Work Off 🐍', de: '{winner} hat unser Shake-Work-Off-Match gewonnen 🐍', pt: '{winner} venceu nossa partida de Shake Work Off 🐍' },

  // Покупки
  purchaseError: { en: 'Could not complete the purchase.', ru: 'Не удалось совершить покупку.', es: 'No se pudo completar la compra.', de: 'Der Kauf konnte nicht abgeschlossen werden.', pt: 'Não foi possível concluir a compra.' },

  // Тиры (локализуются ТОЛЬКО на рендере; хранимые значения остаются английскими)
  tierBronze: { en: 'Bronze', ru: 'Бронза', es: 'Bronce', de: 'Bronze', pt: 'Bronze' },
  tierSilver: { en: 'Silver', ru: 'Серебро', es: 'Plata', de: 'Silber', pt: 'Prata' },
  tierGold: { en: 'Gold', ru: 'Золото', es: 'Oro', de: 'Gold', pt: 'Ouro' },
  tierPlatinum: { en: 'Platinum', ru: 'Платина', es: 'Platino', de: 'Platin', pt: 'Platina' },
  tierDiamond: { en: 'Diamond', ru: 'Алмаз', es: 'Diamante', de: 'Diamant', pt: 'Diamante' },
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof S;

// Перевод с интерполяцией: t('needPlayers', { n: 5 }) заменит {n} на 5.
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s = S[key][lang] ?? S[key].en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

// Локализованное имя тира для UI. Хранимые/аналитические значения ('Bronze'…) не трогаем.
const TIER_KEYS: Record<string, StringKey> = {
  Bronze: 'tierBronze',
  Silver: 'tierSilver',
  Gold: 'tierGold',
  Platinum: 'tierPlatinum',
  Diamond: 'tierDiamond',
};
export function tierName(name: string): string {
  const k = TIER_KEYS[name];
  return k ? t(k) : name;
}
