import { Clapperboard, SlidersHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loopLength, type Anim } from '../engine';
import type { Strings } from '../i18n/strings';
import { cn } from '../lib/cn';
import { GithubIcon } from './brand';
import { addClip, useCycles } from './cycles';
import { ExportMenu } from './export-menu';
import { useBlob, useNotice } from './hooks';
import { runIntro } from './intro';
import { OptionsCard } from './options-card';
import { Player, type Mode } from './player';
import { Segmented } from './primitives/segmented';
import { TooltipProvider } from './primitives/tooltip';
import { describe, REPO, SKILLS, COLEONI } from './site';
import { Timeline } from './timeline';
import { LanguageMenu, ThemeToggle, TopBar } from './top-bar';

function Stage({ player, label, small }: { player: Player; label: string; small: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = host.current!;
    el.appendChild(player.svg.el);
    player.start();
    return () => {
      player.stop();
      player.svg.el.remove();
    };
  }, [player]);
  return (
    <div
      ref={host}
      id="stage"
      role="img"
      aria-label={label}
      className={cn(
        'aspect-square shrink-0 transition-[width] duration-(--motion-slow) ease-out-expo [&>svg]:block [&>svg]:size-full',
        small ? 'w-[min(64vw,15rem,34vh)] md:w-[min(40vh,24rem)]' : 'w-[min(72vw,17rem,40vh)] md:w-[min(52vh,28rem)]',
      )}
    />
  );
}

function Toaster() {
  const notice = useNotice();
  const [shown, setShown] = useState(notice);
  useEffect(() => {
    if (notice) return setShown(notice);
    // the last notice leaves with its own animation
    const id = window.setTimeout(() => setShown(null), 160);
    return () => clearTimeout(id);
  }, [notice]);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      {shown ? (
        <div key={shown.id} className={cn('rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm font-medium text-foreground shadow-lg', notice ? 'animate-toast-in' : 'animate-toast-out')}>
          {shown.text}
        </div>
      ) : null}
    </div>
  );
}

const MODES = [
  { value: 'customize', icon: SlidersHorizontal },
  { value: 'animate', icon: Clapperboard },
] as const;

export function App({ S }: { S: Strings }) {
  const { state, edit } = useBlob();
  const cycles = useCycles(state, edit);
  const [mode, setMode] = useState<Mode>('customize');
  const [player] = useState(() => new Player(state));
  const pendingSeek = useRef<number | null>(null);
  const wordmark = useRef<HTMLElement | null>(null);

  useEffect(() => {
    player.setState(state);
    if (pendingSeek.current !== null) {
      player.seek(pendingSeek.current);
      pendingSeek.current = null;
    }
  }, [player, state]);

  useEffect(() => player.setMode(mode), [player, mode]);

  // the intro plays once, on the first frame
  useLayoutEffect(() => {
    if (player.reduced) return;
    const stage = document.getElementById('stage');
    const o = [...(wordmark.current?.querySelectorAll('[data-body], [data-eye]') ?? [])];
    if (!stage) return;
    const parts = [...document.querySelectorAll<HTMLElement>('[data-intro]')].map((el) => ({ el, from: el.dataset.intro! }));
    return runIntro({ player, stage, o, chrome: parts, onDone: () => {} });
  }, [player]);

  const add = (anim: Anim) => {
    pendingSeek.current = loopLength(state);
    cycles.change((cs) => addClip(cs, anim));
  };

  const modeSwitch = (
    <Segmented
      label={S.mode}
      size="md"
      value={mode}
      onChange={setMode}
      options={MODES.map((m) => ({ ...m, label: S[m.value] }))}
      className="w-60"
    />
  );

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col md:h-dvh md:min-h-[40rem]">
        <TopBar
          S={S}
          onWordmark={(draw, host) => {
            player.also(draw);
            wordmark.current = host;
          }}
          center={<div data-intro="translateY(-6px)">{modeSwitch}</div>}
          end={
            <>
              <div data-intro="translateY(-6px)" className="flex items-center gap-1">
                <ThemeToggle S={S} />
                <LanguageMenu S={S} />
              </div>
              <div data-intro="translateY(-6px)" className="ml-1">
                <ExportMenu state={state} mode={mode} S={S} />
              </div>
            </>
          }
        />
        <div data-intro="translateY(-4px)" className="flex justify-center px-3 pt-1 pb-2 md:hidden">
          {modeSwitch}
        </div>
        <main className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 md:flex-row md:gap-4 md:px-5 md:pb-0">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3">
            <div className="flex min-h-0 flex-1 items-center justify-center py-4 md:py-0">
              <Stage player={player} label={S.stageLabel(describe(state, S))} small={mode === 'animate'} />
            </div>
            {mode === 'animate' ? <Timeline state={state} cycles={cycles} player={player} S={S} className="w-full max-w-5xl animate-rise-in md:mb-1" /> : null}
          </div>
          <div data-intro="translateX(16px)" className="md:w-[22rem] md:shrink-0 md:pt-2">
            <OptionsCard state={state} edit={edit} mode={mode} onAdd={add} S={S} className="md:max-h-full md:overflow-y-auto" />
          </div>
        </main>
        <footer data-intro="translateY(6px)" className="flex h-10 shrink-0 items-center justify-center gap-2 px-4 text-2xs text-foreground-subtle">
          <span>
            {S.madeBy}{' '}
            <a href={COLEONI} rel="noopener" className="font-medium text-foreground-muted transition-colors hover:text-foreground">
              Coleoni
            </a>
          </span>
          <span aria-hidden>·</span>
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
            <GithubIcon className="size-3" />
            {S.github}
            <span className="sr-only"> {S.newTab}</span>
          </a>
          <span aria-hidden>·</span>
          <a href={SKILLS} rel="noopener" className="transition-colors hover:text-foreground">
            {S.skills}
          </a>
        </footer>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
