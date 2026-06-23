/// <reference types="jest" />
import { EVENTS, baseProps, eventBody, hasAnalytics, identify, track } from './analytics';

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  (console.log as jest.Mock).mockRestore?.();
});

describe('baseProps', () => {
  test('содержит идентификацию приложения и платформу', () => {
    const b = baseProps();
    expect(b.app).toBe('chroma-coil');
    expect(typeof b.app_version).toBe('string');
    expect(typeof b.platform).toBe('string');
  });
});

describe('eventBody', () => {
  test('собирает корректное тело запроса PostHog', () => {
    const body = eventBody('key123', EVENTS.matchStart, 'p_abc', { mode: 'ranked', role: 'host' });
    expect(body.api_key).toBe('key123');
    expect(body.event).toBe('match_start');
    expect(body.distinct_id).toBe('p_abc');
    expect(typeof body.timestamp).toBe('string');
    const props = body.properties as Record<string, unknown>;
    expect(props.mode).toBe('ranked');
    expect(props.role).toBe('host');
    expect(props.app).toBe('chroma-coil'); // базовые свойства подмешаны
  });
});

describe('EVENTS', () => {
  test('каноничные имена событий стабильны', () => {
    expect(EVENTS.matchEnd).toBe('match_end');
    expect(EVENTS.fatalMistake).toBe('fatal_mistake');
    expect(EVENTS.foodEaten).toBe('food_eaten');
  });
});

describe('no-op без ключа', () => {
  test('hasAnalytics=false в тестовой среде, track/identify не бросают', () => {
    expect(hasAnalytics).toBe(false);
    expect(() => track(EVENTS.appOpen, { entry: 'direct' })).not.toThrow();
    expect(() => identify('p_1', { rating: 1000 })).not.toThrow();
  });
});
