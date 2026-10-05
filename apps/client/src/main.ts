import { mount } from 'svelte';
import './i18n/i18n.svelte.ts';
import App from './ui/App.svelte';

const uiEl = document.getElementById('app');
if (!uiEl) throw new Error('index.html incomplet : #app est requis');

mount(App, { target: uiEl });
