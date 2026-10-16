import { Clapperboard, SlidersHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_DUR, MAX_CLIPS, loopLength, type Anim } from 'blob-avatar/engine';
import { randomLook } from 'blob-avatar/engine/codec';
import type { Strings } from '../i18n/strings';
import { cn } from '../lib/cn';
import { ColeoniMark, GithubIcon } from './brand';
import { announce, Announcer } from './animate/announce';
import { savedName } from './animate/cycle-menu';
import { Library } from './animate/library';
import { Storyboard } from './animate/storyboard';
import { insertClip, starts, tellingMoment } from './cycles';
import { cyclesOf, useEditor, type Cycles } from './editor';
import { ExportMenu, exportOptions } from './export-menu';
import { holdNotice, dismiss, toast, useNotice } from './hooks';
import { runIntro } from './intro';
import { OptionsCard } from './options-card';
import { Player, type Mode } from './player';
import { settings } from './prefs';
import { bindShortcuts, type Action } from './shortcuts';
import { SettingsMenu, ShortcutsModal } from './settings-menu';
import { StageToolbar } from './stage-toolbar';
import { Button } from './primitives/button';
import { Segmented } from './primitives/segmented';
import { TooltipProvider } from './primitives/tooltip';
import { STAGE_CLASS, useRecordingStill } from './recording';
import { coleoniHome, describe, REPO, SKILLS, LOADERS } from './site';
import { GithubLink, LanguageMenu, ThemeToggle, TopBar } from './top-bar';

/** the stage; with a backdrop, it shows the export's background and round crop around the blob, and when it reacts, a click plays the reaction */
function Stage({ player, label, small, backdrop, reacts }: { player: Player; label: string; small: boolean; backdrop: { bg: string | null; round: boolean } | null; reacts: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = host.current!;
    // redrawn every frame: the screen recorder (rr-block) keeps only its box, or a
    // minute of the editor would weigh tens of megabytes; recording.ts paints the
    // blob at rest in that box
    player.svg.el.classList.add('rr-block', STAGE_CLASS);
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
      onClick={reacts ? () => player.react() : undefined}
      className={cn(
        'aspect-square shrink-0 scroll-mt-16 transition-[width,border-radius,background-color] duration-(--motion-slow) ease-out-expo [&>svg]:block [&>svg]:size-full',
        small ? 'w-[min(64vw,15rem,34vh)] md:w-[min(40vh,24rem)]' : 'w-[min(72vw,17rem,40vh)] md:w-[min(52vh,28rem)]',
        // the export cuts at the edge of the picture: so does the stage, then
        backdrop && ['overflow-hidden', backdrop.round ? 'rounded-full' : 'rounded-xs', !backdrop.bg && 'checker'],
        reacts && 'cursor-pointer select-none',
      )}
      style={backdrop?.bg ? { backgroundColor: backdrop.bg } : undefined}
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
        <div
          key={shown.id}
          className={cn(
            'flex items-center gap-3 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm font-medium text-foreground shadow-lg',
            shown.action && 'pointer-events-auto py-1.5 pr-1.5',
            notice ? 'animate-toast-in' : 'animate-toast-out',
          )}
          onPointerEnter={() => holdNotice(true)}
          onPointerLeave={() => holdNotice(false)}
          onFocus={() => holdNotice(true)}
          onBlur={() => holdNotice(false)}
        >
          {shown.text}
          {shown.action ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-sm text-foreground"
              onClick={() => {
                shown.action?.run();
                dismiss();
              }}
            >
              {shown.action.label}
            </Button>
          ) : null}
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
  const { editor, doc, canUndo, canRedo } = useEditor();
  const state = doc.blob;
  const edit = editor.edit;
  const prefs = settings.use();
  const [mode, setMode] = useState<Mode>('customize');
  const [player] = useState(() => new Player(state, prefs.still));
  useRecordingStill(state);
  // the clip picked on the track, and whether it plays over and over
  const [selected, setSelected] = useState<number | null>(null);
  const [looping, setLooping] = useState(false);
  const sel = selected !== null && selected < state.cycle.length ? selected : null;
  const loopOn = looping && sel !== null;
  // whether the cycle plays, for the dock's button (the player says so every frame)
  const [playing, setPlaying] = useState(player.isPlaying);
  useEffect(() => player.subscribe((_t, _L, on) => setPlaying(on)), [player]);
  const base = cyclesOf(editor, doc.book);
  const cycles: Cycles = {
    ...base,
    // changing a template keeps it, and makes a cycle of the person's: the page says which
    change: (f, key) => {
      const fresh = base.change(f, key);
      if (fresh) toast(S.savedAs(savedName(fresh, S)));
      return fresh;
    },
    // another cycle starts with nothing picked
    select: (id) => {
      setSelected(null);
      setLooping(false);
      base.select(id);
    },
  };
  const pendingSeek = useRef<number | null>(null);
  const wordmark = useRef<HTMLElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const shortcuts = useRef<Partial<Record<Action, () => void>>>({});

  useEffect(() => {
    player.setState(state);
    if (pendingSeek.current !== null) {
      player.seek(pendingSeek.current);
      pendingSeek.current = null;
    }
  }, [player, state]);

  useEffect(() => player.setMode(mode), [player, mode]);
  useEffect(() => player.setFollow(prefs.follow), [player, prefs.follow]);
  useEffect(() => player.setStill(prefs.still), [player, prefs.still]);

  // the intro plays once, on the first frame
  useLayoutEffect(() => {
    if (player.still) return;
    const stage = document.getElementById('stage');
    const o = [...(wordmark.current?.querySelectorAll('[data-body], [data-eye]') ?? [])];
    if (!stage) return;
    const parts = [...document.querySelectorAll<HTMLElement>('[data-intro]')].map((el) => ({ el, from: el.dataset.intro! }));
    return runIntro({ player, stage, o, chrome: parts, onDone: () => {} });
  }, [player]);

  // a looped clip plays over and over; the range follows the clip as it moves or stretches
  useEffect(() => {
    if (mode !== 'animate' || !loopOn || sel === null) return player.setRange(null);
    const { at } = starts(state.cycle);
    player.setRange([at[sel], at[sel] + state.cycle[sel].dur]);
  }, [player, mode, loopOn, sel, state.cycle]);

  /** an animation from the library: after the selected clip, or at the end; it is selected and shown */
  const add = (anim: Anim) => {
    const clips = state.cycle;
    if (clips.length >= MAX_CLIPS) return toast(S.full);
    const at = sel === null ? clips.length : sel + 1;
    // the stage shows the new clip: from its start while playing, its telling moment while paused
    pendingSeek.current = (starts(clips).at[at] ?? loopLength(state)) + (player.isPlaying ? 0 : tellingMoment({ anim, dur: DEFAULT_DUR[anim] }));
    const fresh = base.change((cs) => insertClip(cs, at, anim));
    const said = S.said.added(S.anims[anim], at + 1, clips.length + 1);
    setSelected(at);
    announce(said);
    // the track may be out of sight (below the fold on a phone): the notice says it, with an undo
    const track = document.querySelector('[data-track]')?.getBoundingClientRect();
    const hidden = !track || track.bottom < 0 || track.top > innerHeight;
    if (fresh) toast(`${hidden ? said + '. ' : ''}${S.savedAs(savedName(fresh, S))}`);
    else if (hidden) toast(said, { label: S.undo, run: editor.undoLast() });
  };

  const loop = (on: boolean) => {
    setLooping(on);
    // looping is a request to see it move
    if (on) player.setPlaying(true);
  };

  // Escape lets go of the picked clip (a modal or a menu takes its own Escape)
  const escape = useRef<() => boolean>(() => false);
  escape.current = () => {
    if (mode !== 'animate' || sel === null) return false;
    setSelected(null);
    setLooping(false);
    return true;
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || (e.target instanceof Element && e.target.closest('[role="dialog"]'))) return;
      if (escape.current()) e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  /** a new look from the swatches; the cycle stays, and a screen reader hears what came out */
  const randomize = () => {
    const r = randomLook(state, Math.floor(Math.random() * 2 ** 31));
    edit((s) => {
      s.shape = r.shape;
      s.color = r.color;
      s.expression = r.expression;
      s.seed = r.seed;
    });
    announce(S.stageLabel(describe(r, S)));
  };

  useEffect(() => {
    shortcuts.current = {
      randomize,
      undo: editor.undo,
      redo: editor.redo,
      play: mode === 'animate' ? () => player.setPlaying(!player.isPlaying) : undefined,
      help: () => {
        setSettingsOpen(false);
        setKeysOpen(true);
      },
    };
  });
  useEffect(() => bindShortcuts(() => shortcuts.current), []);

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
        {/* the address bar's hash is the blob: the link moves the focus itself rather than change it */}
        <a
          href="#conteudo"
          className="sr-only z-60 rounded-lg border border-border-strong bg-surface-raised text-sm font-medium text-foreground shadow-lg focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:px-3 focus:py-2"
          onClick={(e) => {
            e.preventDefault();
            const main = document.getElementById('conteudo');
            main?.focus();
            main?.scrollIntoView({ block: 'start' });
          }}
        >
          {S.skipToContent}
        </a>
        <TopBar
          S={S}
          onWordmark={(draw, host) => {
            player.also(draw);
            wordmark.current = host;
          }}
          center={<div data-intro="translateY(-6px)">{modeSwitch}</div>}
          below={
            <div data-intro="translateY(-4px)" className="flex justify-center px-3 pt-1 pb-2 lg:hidden">
              {modeSwitch}
            </div>
          }
          end={
            <>
              <div data-intro="translateY(-6px)" className="flex items-center gap-0.5 sm:gap-1">
                <SettingsMenu S={S} open={settingsOpen} onOpenChange={setSettingsOpen} onShortcuts={() => setKeysOpen(true)} />
                <ThemeToggle S={S} />
                <LanguageMenu S={S} />
                <GithubLink S={S} />
              </div>
              <div data-intro="translateY(-6px)" className="ml-1">
                <ExportMenu state={state} mode={mode} S={S} />
              </div>
            </>
          }
        />
        <main id="conteudo" tabIndex={-1} className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 outline-none md:flex-row md:gap-4 md:px-5 md:pb-0">
          <h1 className="sr-only">{S.h1}</h1>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 md:pb-3">
            {/* the tools sit in a dock right under the blob */}
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-4 md:py-0">
              <Stage player={player} label={S.stageLabel(describe(state, S))} small={mode === 'animate'} backdrop={prefs.showBg ? exportOptions(prefs) : null} reacts={prefs.react} />
              <StageToolbar
                S={S}
                canUndo={canUndo}
                canRedo={canRedo}
                onRandomize={randomize}
                onUndo={editor.undo}
                onRedo={editor.redo}
                play={mode === 'animate' ? { playing, onToggle: () => player.setPlaying(!player.isPlaying) } : null}
                className="relative z-10 max-md:-mt-2 md:-mt-12"
              />
            </div>
            {mode === 'animate' ? (
              <Storyboard state={state} cycles={cycles} player={player} S={S} selected={sel} onSelect={setSelected} looping={loopOn} onLoop={loop} className="animate-rise-in" />
            ) : null}
          </div>
          <div data-intro="translateX(16px)" className="md:w-[22rem] md:shrink-0 md:pt-2 md:pb-3">
            <OptionsCard
              state={state}
              edit={edit}
              mode={mode}
              S={S}
              className="md:max-h-full md:overflow-y-auto"
              library={<Library look={state} clips={state.cycle} after={sel !== null ? S.anims[state.cycle[sel].anim] : null} S={S} onAdd={add} />}
            />
          </div>
        </main>
        <footer data-intro="translateY(6px)" className="flex h-10 shrink-0 items-center justify-center gap-2 px-4 text-2xs text-foreground-subtle">
          <span className="flex items-center gap-[0.25em]">
            {S.madeBy}
            <a
              href={coleoniHome(S)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-[0.5em] py-1 font-medium text-foreground-muted transition-colors hover:text-foreground"
            >
              <ColeoniMark />
              Coleoni
              <span className="sr-only"> {S.newTab}</span>
            </a>
          </span>
          <span aria-hidden>·</span>
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
            <GithubIcon className="size-3" />
            {S.github}
            <span className="sr-only"> {S.newTab}</span>
          </a>
          <span aria-hidden>·</span>
          <a href={S.lang === 'pt' ? `${SKILLS}/pt/` : SKILLS} rel="noopener" className="transition-colors hover:text-foreground">
            {S.skills}
          </a>
          <span aria-hidden>·</span>
          <a href={S.lang === 'pt' ? `${LOADERS}/pt/` : LOADERS} rel="noopener" className="transition-colors hover:text-foreground">
            Loaders
          </a>
        </footer>
      </div>
      <ShortcutsModal S={S} open={keysOpen} onOpenChange={setKeysOpen} />
      <Toaster />
      <Announcer />
    </TooltipProvider>
  );
}
