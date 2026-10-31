export interface SyncFacts {
  /** Existe um cofre na nuvem. */
  hasRemote: boolean;
  /** Carimbo atual do cofre na nuvem. */
  remoteStamp: string | null;
  /** Último carimbo da nuvem que este aparelho já incorporou. */
  knownStamp: string | null;
  /** Este aparelho tem alterações ainda não enviadas. */
  pending: boolean;
  /** Este aparelho tem dados que o usuário criou. */
  localHasData: boolean;
}

export type SyncAction = 'nothing' | 'push' | 'pull' | 'conflict';

/** Decide o que fazer ao abrir o app ou voltar a ele. Nunca apaga dados sem perguntar. */
export function decideSync(f: SyncFacts): SyncAction {
  if (!f.hasRemote) return f.localHasData || f.pending ? 'push' : 'nothing';
  if (f.remoteStamp === f.knownStamp) return f.pending ? 'push' : 'nothing';
  // A nuvem mudou desde a última vez.
  if (!f.localHasData && !f.pending) return 'pull';
  if (f.knownStamp !== null && !f.pending) return 'pull';
  return 'conflict';
}
