import app from '@system.app';

export default {
  data: {
    title: 'List demo',
    items: [
      { id: '1', title: 'First item' },
      { id: '2', title: 'Second item' },
      { id: '3', title: 'Third item' },
    ],
  },
  onExit() {
    app.terminate();
  },
};
