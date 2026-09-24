import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

// Add a page: create the .md file, then list it in the sidebar below.
export default withMermaid(
  defineConfig({
    title: 'Robot Fleet Platform',
    description: 'Architecture of a real time platform for 1,000 service robots across 20 hotels.',
    base: '/robot-fleet-platform/',
    cleanUrls: true,
    lastUpdated: true,
    // Local URLs like http://localhost:3000 are instructions, not links to check.
    ignoreDeadLinks: 'localhostLinks',
    themeConfig: {
      nav: [
        { text: 'Guide', link: '/guide/use-case' },
        { text: 'Architecture', link: '/architecture/overview' },
        { text: 'Reference', link: '/reference/api' },
        { text: 'Operations', link: '/operations/deployment' },
      ],
      sidebar: [
        {
          text: 'Guide',
          items: [
            { text: 'Customer use case', link: '/guide/use-case' },
            { text: 'Using the dashboard', link: '/guide/dashboard' },
          ],
        },
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/architecture/overview' },
            { text: 'Ingestion service', link: '/architecture/ingestion' },
            { text: 'Orchestration API', link: '/architecture/orchestration-api' },
            { text: 'Fleet dashboard', link: '/architecture/dashboard' },
            { text: 'Telemetry flow', link: '/architecture/telemetry-flow' },
            { text: 'Performance design', link: '/architecture/performance' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'HTTP and WebSocket API', link: '/reference/api' },
            { text: 'Data model', link: '/reference/data-model' },
            { text: 'Configuration', link: '/reference/configuration' },
          ],
        },
        {
          text: 'Operations',
          items: [
            { text: 'Deployment', link: '/operations/deployment' },
            { text: 'Security model', link: '/operations/security' },
            { text: 'Running and testing', link: '/operations/running' },
            { text: 'Known limits', link: '/operations/limits' },
          ],
        },
        {
          text: 'Contributing',
          items: [{ text: 'Maintaining these docs', link: '/contributing' }],
        },
      ],
      search: { provider: 'local' },
      editLink: {
        pattern: 'https://github.com/cnotv/robot-fleet-platform/edit/main/docs/:path',
        text: 'Edit this page on GitHub',
      },
      socialLinks: [{ icon: 'github', link: 'https://github.com/cnotv/robot-fleet-platform' }],
    },
    mermaid: { securityLevel: 'strict' },
  }),
);
