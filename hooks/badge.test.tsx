import { expect, mock, test } from 'claude-code/testing'

const TOML = `background = "#000000"
red = "#ea9e9e"
yellow = "#e8b84a"
green = "#66cb8e"
`

const USAGE = {
  input_tokens: 1,
  output_tokens: 1,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

const BAND = {
  plugin: 'agent-badge',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

test('labels the agent, tracks the current and previous task, shows model and folder', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  mock.env(on, { HOME: '/home/u' })
  on('session.id', async () => ({ value: 'session-1' }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', async () => ({ value: '/home/u/site' }))
  on('fs.read', async () => ({ value: TOML }))
  on('session.usage', async () => ({
    value: {
      startedAt: 0,
      context: { tokens: 76000, window: 200000, percent: 38 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 12 },
        { kind: 'seven_day', percentUsed: 92 },
      ],
      cost: { usd: 2.14 },
    },
  }))

  const replies = [
    '{"role": "copywriter", "task": "Write landing page headline", "isNewTask": true}',
    '{"role": "copywriter", "task": "Draft launch email", "isNewTask": true}',
  ]
  on('model.complete', async () => ({ value: { isAnswered: true, text: replies.shift() ?? '{}', usage: USAGE } }))
  on('prompt.submit', async ($, e) => ({ text: e.text }))
  on('session.start', async ($, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/home/u/site', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /NEW AGENT/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /~\/site/ })).toBeDefined()
  expect(await ui.find({ key: 'avatar' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /38%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /12%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /92%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$2\.14/ })).toBeDefined()

  await $.prompt.submit({ text: 'write me a headline for the landing page', wait: false, origin: { kind: 'composer' } })
  await clock.advance(10)
  expect(await ui.find({ type: 'Text', text: /COPYWRITER/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Write landing page headline/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /earlier: nothing yet/ })).toBeDefined()

  await $.prompt.submit({ text: 'now draft the launch email', wait: false, origin: { kind: 'composer' } })
  await clock.advance(10)
  expect(await ui.find({ type: 'Text', text: /Draft launch email/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /earlier: Write landing page headline/ })).toBeDefined()

  const wide = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 200 }, surface: 'terminal' })
  expect(await wide.find({ key: 'avatar' })).toBeDefined()
  expect(await wide.find({ key: 'ring-0' })).toBeDefined()
  expect(await wide.find({ type: 'Text', text: /124k left/ })).toBeDefined()
  expect(await wide.find({ type: 'Text', text: /Weekly limit/ })).toBeDefined()
  expect(await wide.find({ type: 'Text', text: /\$2\.14/ })).toBeDefined()

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Text', text: /COPYWRITER/ })).toBeDefined()
})
