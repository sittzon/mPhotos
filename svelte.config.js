import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ precompress: true }),
		alias: {
			$components: 'src/lib/components',
			$api: 'src/api',
			$helpers: 'src/helpers'
		}
	}
};

export default config;
