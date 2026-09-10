import { Hono } from 'hono';
import { initialNotices, Notice } from '../db';

const noticesApp = new Hono();

let noticesList: Notice[] = [...initialNotices];

// GET all notices
noticesApp.get('/', (c) => {
  const category = c.req.query('category');
  let list = [...noticesList];

  if (category && category !== 'All') {
    list = list.filter((n) => n.category.toLowerCase() === category.toLowerCase());
  }

  return c.json({
    success: true,
    notices: list,
  });
});

// POST create notice
noticesApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));

  if (!body.title || !body.content) {
    return c.json({ success: false, message: 'नोटिस शीर्षक एवं विवरण आवश्यक हैं।' }, 400);
  }

  const newNotice: Notice = {
    id: `not-${Date.now()}`,
    title: body.title,
    content: body.content,
    category: body.category || 'General',
    targetAudience: body.targetAudience || 'All',
    publishedBy: body.publishedBy || 'प्रशासन कार्यालय',
    publishedDate: new Date().toISOString().split('T')[0],
    priority: body.priority || 'Normal',
    alertSent: true,
  };

  noticesList.unshift(newNotice);

  return c.json({
    success: true,
    message: 'सूचना नोटिस बोर्ड पर प्रकाशित की गई और त्वरित अलर्ट प्रेषित किया गया।',
    notice: newNotice,
  }, 201);
});

// DELETE notice
noticesApp.delete('/:id', (c) => {
  const id = c.req.param('id');
  noticesList = noticesList.filter((n) => n.id !== id);
  return c.json({ success: true, message: 'नोटिस हटा दिया गया।' });
});

export default noticesApp;
