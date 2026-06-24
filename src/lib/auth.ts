// Слой авторизации (Supabase Auth). Фаза 1: анонимный вход = устойчивая identity
// (uid), на которую завязан профиль/лидерборд. Фаза 2 (далее): апгрейд до аккаунта
// по email-коду (OTP) → кросс-девайс. Всё офлайн-безопасно: при недоступности сети
// функции возвращают null/ошибку, игра продолжает работать на локальном профиле.
import { hasSupabase, supabase } from './supabase';

export interface AuthUser {
  id: string;
  email: string | null;
  isAnon: boolean;
}

function toUser(u: { id: string; email?: string | null; is_anonymous?: boolean } | null): AuthUser | null {
  if (!u) return null;
  return { id: u.id, email: u.email ?? null, isAnon: Boolean(u.is_anonymous) || !u.email };
}

export async function getUser(): Promise<AuthUser | null> {
  if (!hasSupabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return toUser(data.user as any);
  } catch {
    return null;
  }
}

// Гарантирует сессию: если её нет — анонимный вход. Возвращает uid или null (офлайн/выключено).
export async function ensureSession(): Promise<AuthUser | null> {
  if (!hasSupabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) return null;
    }
    return await getUser();
  } catch {
    return null;
  }
}

// Отправить 6-значный код на email (для апгрейда анонимного аккаунта / входа на новом устройстве).
export async function sendEmailCode(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabase) return { ok: false, error: 'offline' };
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Подтвердить код. type 'email' покрывает и вход, и подтверждение.
export async function verifyEmailCode(email: string, token: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabase) return { ok: false, error: 'offline' };
  try {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function signOut(): Promise<void> {
  if (!hasSupabase) return;
  try {
    await supabase.auth.signOut();
  } catch {}
}

// Удалить аккаунт (Apple-требование для приложений с регистрацией): стираем строку
// профиля (RPC delete_my_account по auth.uid()) и выходим из сессии. Локальные данные
// чистит вызывающий экран. Полное удаление auth-записи — позже через админ-функцию.
export async function deleteAccount(): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabase) return { ok: false, error: 'offline' };
  try {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) return { ok: false, error: error.message };
    await supabase.auth.signOut();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
