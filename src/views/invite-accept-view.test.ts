/**
 * Testes focados da invite-accept-view
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('lit', () => {
  const serialize = (value: unknown): string => {
    if (value === null || value === undefined || value === false) {
      return '';
    }

    if (Array.isArray(value)) {
      return value.map((item) => serialize(item)).join('');
    }

    if (typeof value === 'function') {
      return '';
    }

    return String(value);
  };

  class MockLitElement {
    connectedCallback(): void {
      // no-op
    }
  }

  return {
    LitElement: MockLitElement,
    html: (strings: TemplateStringsArray, ...values: unknown[]) => {
      let output = '';
      for (let index = 0; index < strings.length; index += 1) {
        output += strings[index];
        if (index < values.length) {
          output += serialize(values[index]);
        }
      }
      return output;
    },
  };
});

vi.mock('lit/decorators.js', () => ({
  customElement: () => (target: unknown) => target,
  state: () => () => undefined,
}));

const {
  navigateMock,
  getCurrentRouteMock,
  acceptVisitInviteByTokenMock,
  syncNowMock,
  pullRemoteVisitMembershipsAndVisitsMock,
  pullRemoteNotesMock,
  getVisitByIdMock,
  getCurrentUserVisitMemberMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  getCurrentRouteMock: vi.fn(() => ({ params: { token: 'token-123' } })),
  acceptVisitInviteByTokenMock: vi.fn(),
  syncNowMock: vi.fn(),
  pullRemoteVisitMembershipsAndVisitsMock: vi.fn(),
  pullRemoteNotesMock: vi.fn(),
  getVisitByIdMock: vi.fn(),
  getCurrentUserVisitMemberMock: vi.fn(),
}));

vi.mock('@/router/router', () => ({
  navigate: navigateMock,
  getCurrentRoute: getCurrentRouteMock,
}));

vi.mock('@/services/db/visit-invites-service', () => ({
  acceptVisitInviteByToken: acceptVisitInviteByTokenMock,
}));

vi.mock('@/services/sync/sync-service', () => ({
  syncNow: syncNowMock,
  pullRemoteVisitMembershipsAndVisits: pullRemoteVisitMembershipsAndVisitsMock,
  pullRemoteNotes: pullRemoteNotesMock,
}));

vi.mock('@/services/db/visits-service', () => ({
  getVisitById: getVisitByIdMock,
}));

vi.mock('@/services/db/visit-members-service', () => ({
  getCurrentUserVisitMember: getCurrentUserVisitMemberMock,
}));

import { InviteAcceptView } from './invite-accept-view';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

function renderText(view: InviteAcceptView): string {
  return String(view.render());
}

describe('invite-accept-view', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(globalThis, 'window', {
      value: globalThis,
      configurable: true,
      writable: true,
    });

    syncNowMock.mockResolvedValue(undefined);
    pullRemoteVisitMembershipsAndVisitsMock.mockResolvedValue(undefined);
    pullRemoteNotesMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['accepted', 'already-member'] as const)(
    'entra em preparing para status %s e mostra spinner + microcopy',
    async (status) => {
      const deferredSync = createDeferred<undefined>();

      acceptVisitInviteByTokenMock.mockResolvedValue({ status, visitId: 'visit-1' });
      syncNowMock.mockReturnValue(deferredSync.promise);
      getVisitByIdMock.mockResolvedValue({ id: 'visit-1' });
      getCurrentUserVisitMemberMock.mockResolvedValue({ status: 'active' });

      const view = new InviteAcceptView();
      const handlingPromise = (view as unknown as { handleAcceptInvite: () => Promise<void> }).handleAcceptInvite();

      await Promise.resolve();
      await Promise.resolve();

      expect((view as unknown as { isPreparingVisit: boolean }).isPreparingVisit).toBe(true);

      const preparingUi = renderText(view);
      expect(preparingUi).toContain('Preparando sua visita');
      expect(preparingUi).toContain('spinner-border');

      deferredSync.resolve(undefined);
      await handlingPromise;
    }
  );

  it('libera Ver visita quando visita + membership aparecem localmente', async () => {
    vi.useFakeTimers();

    acceptVisitInviteByTokenMock.mockResolvedValue({ status: 'accepted', visitId: 'visit-1' });
    getVisitByIdMock.mockResolvedValueOnce(undefined).mockResolvedValue({ id: 'visit-1' });
    getCurrentUserVisitMemberMock.mockResolvedValueOnce(undefined).mockResolvedValue({ status: 'active' });

    const view = new InviteAcceptView();
    const handlingPromise = (view as unknown as { handleAcceptInvite: () => Promise<void> }).handleAcceptInvite();

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(300);
    await handlingPromise;

    const finalUi = renderText(view);
    expect(finalUi).toContain('Ver visita');
    expect(finalUi).not.toContain('Ir para minhas visitas');
  });

  it('em timeout não libera Ver visita e mostra fallback Ir para minhas visitas', async () => {
    vi.useFakeTimers();

    acceptVisitInviteByTokenMock.mockResolvedValue({ status: 'accepted', visitId: 'visit-1' });
    getVisitByIdMock.mockResolvedValue(undefined);
    getCurrentUserVisitMemberMock.mockResolvedValue(undefined);

    const view = new InviteAcceptView();
    const handlingPromise = (view as unknown as { handleAcceptInvite: () => Promise<void> }).handleAcceptInvite();

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(7000);
    await handlingPromise;

    const finalUi = renderText(view);
    expect(finalUi).toContain('Ir para minhas visitas');
    expect(finalUi).not.toContain('Ver visita');
  });

  it('status não-sucesso mantém fluxo normal sem entrar em preparing', async () => {
    acceptVisitInviteByTokenMock.mockResolvedValue({ status: 'invite-expired' });

    const view = new InviteAcceptView();
    await (view as unknown as { handleAcceptInvite: () => Promise<void> }).handleAcceptInvite();

    expect((view as unknown as { isPreparingVisit: boolean }).isPreparingVisit).toBe(false);
    expect(syncNowMock).not.toHaveBeenCalled();
    expect(pullRemoteVisitMembershipsAndVisitsMock).not.toHaveBeenCalled();

    const finalUi = renderText(view);
    expect(finalUi).toContain('Convite expirado');
    expect(finalUi).not.toContain('Preparando sua visita');
  });
});
