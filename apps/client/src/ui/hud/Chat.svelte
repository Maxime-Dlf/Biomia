<script lang="ts">
  /**
   * Chat (§11.2) : `Entrée` envoie au chat d'équipe (chat général en individuel), `Maj + Entrée` au
   * chat général. Le texte est toujours affiché échappé (§18.2). Réductible : dans Discord, le vocal
   * reste le canal principal.
   */
  import { CHAT_MAX_LENGTH, type ChatLine } from '@crassecadia/protocol';
  import { onDestroy, tick, untrack } from 'svelte';
  import { app } from '../../app/app.svelte.ts';
  import type { NetworkDriver } from '../../game/network-driver.ts';
  import { t } from '../../i18n/i18n.svelte.ts';

  let { driver, teams }: { driver: NetworkDriver; teams: boolean } = $props();

  let lines = $state.raw<ChatLine[]>([]);
  // Réduit au départ dans Discord (le vocal prime) et sur un écran étroit (il couvrirait le plateau).
  const wide = typeof matchMedia === 'undefined' || matchMedia('(min-width: 701px)').matches;
  let open = $state(app.platform.kind !== 'discord' && wide);
  let seen = $state(0);
  let text = $state('');
  let list: HTMLOListElement | undefined = $state();

  const unread = $derived(open ? 0 : Math.max(0, lines.length - seen));
  const unsubscribe = untrack(() => driver).onChat(async (next) => {
    lines = next;
    if (open) seen = next.length;
    await tick();
    list?.scrollTo({ top: list.scrollHeight });
  });
  onDestroy(unsubscribe);

  function toggle() {
    open = !open;
    seen = lines.length;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    driver.sendChat(message, e.shiftKey ? 'all' : 'team');
    text = '';
  }
</script>

<section class="chat" class:open data-interactive aria-label={t('chat.title')}>
  <button class="toggle" aria-expanded={open} onclick={toggle}>
    {t('chat.title')}{#if unread > 0}<span class="badge">{unread}</span>{/if}
  </button>
  {#if open}
    <ol bind:this={list} aria-live="polite">
      {#each lines as line (line.id)}
        <li class:team={line.team}>
          {#if line.team}<span class="scope">[{t('chat.team')}]</span>{/if}
          <strong>{line.name}</strong> : {line.text}
        </li>
      {/each}
    </ol>
    {#if !driver.spectator}
      <input
        aria-label={t('chat.input')}
        placeholder={teams ? t('chat.hintTeams') : t('chat.hintAll')}
        maxlength={CHAT_MAX_LENGTH}
        bind:value={text}
        onkeydown={onKey}
      />
    {/if}
  {/if}
</section>

<style>
  .chat {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.4rem 0.6rem;
    display: grid;
    gap: 0.35rem;
    width: min(22rem, 90vw);
    pointer-events: auto;
  }
  /* Réduit : seul le bouton occupe l'écran (il ne doit pas masquer le plateau). */
  .chat:not(.open) {
    width: auto;
  }
  .toggle {
    justify-self: start;
    background: none;
    border: none;
    font-weight: bold;
    padding: 0;
    cursor: pointer;
  }
  .badge {
    margin-left: 0.4rem;
    background: #b5442e;
    border-radius: 999px;
    padding: 0 0.4rem;
    font-size: 0.75rem;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 9rem;
    overflow-y: auto;
    font-size: 0.85rem;
    display: grid;
    gap: 0.15rem;
    overflow-wrap: anywhere;
  }
  .team {
    color: #9fd3a3;
  }
  .scope {
    opacity: 0.8;
    margin-right: 0.25rem;
  }
  input {
    width: 100%;
  }
</style>
