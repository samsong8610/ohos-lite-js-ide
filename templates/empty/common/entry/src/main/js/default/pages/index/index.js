import app from '@system.app';

export default {
  data: {
    title: 'Hello',
  },
  onExit() {
    app.terminate();
  },
};
