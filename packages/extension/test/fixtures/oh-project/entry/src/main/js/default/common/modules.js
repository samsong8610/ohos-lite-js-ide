import router from '@system.router';
import fetch from '@system.fetch';

export function go() {
  router.replace({ uri: 'pages/index/index' });
  return fetch;
}
