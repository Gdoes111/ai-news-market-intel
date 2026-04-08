# Planning Guide

An AI-powered news intelligence dashboard that aggregates, analyzes, and prioritizes breaking news with a focus on market-moving events and geopolitical developments.

**Experience Qualities**:
1. **Focused** - Cuts through noise to surface only what matters, saving users time by pre-filtering relevance
2. **Intelligent** - AI-driven categorization understands context and market implications automatically
3. **Urgent** - Real-time feed presentation with visual hierarchy that emphasizes breaking developments

**Complexity Level**: Light Application (multiple features with basic state)
- The app aggregates news, uses AI to categorize content, and presents it in organized sections with filtering capabilities

## Essential Features

### RSS Feed Integration
- **Functionality**: Automatically fetches news from multiple trusted RSS feeds (Reuters, Bloomberg, Financial Times, BBC, WSJ, AP, etc.) with configurable enable/disable toggles
- **Purpose**: Eliminates manual news entry by automatically pulling from authoritative sources, ensuring continuous flow of relevant market and geopolitical news
- **Trigger**: User clicks "RSS Feeds" button to open feed management dialog
- **Progression**: User opens RSS dialog → Views 8+ pre-configured feeds → Toggles feeds on/off → Clicks "Fetch News" → System pulls latest articles → AI analyzes each → Deduplicates against existing news → Adds unique items to feed
- **Success criteria**: Fetches 20-30 articles in under 10 seconds, deduplicates 100%, maintains feed preferences between sessions

### AI-Powered News Analysis
- **Functionality**: Processes news content through AI model to extract key information, determine market relevance, and assess priority level
- **Purpose**: Automatically categorizes and ranks news without manual sorting, identifying which items deserve immediate attention
- **Trigger**: User adds news URL or text, or refreshes existing feeds
- **Progression**: User inputs news source → AI analyzes content → System extracts title, summary, relevance scores → Categorizes into appropriate sections → Displays with priority indicators
- **Success criteria**: News items accurately categorized with <5 second processing time, relevance scores align with market impact

### Three-Tier News Organization
- **Functionality**: Displays news in three distinct views: All News (comprehensive), Market News (stocks/geopolitics/economy), and Priority News (critical items only)
- **Purpose**: Provides flexible access levels - quick scan of essentials or deep dive into all available information
- **Trigger**: User navigates between section tabs or views default Priority section
- **Progression**: User opens app → Sees Priority News by default → Can switch to Market News for economic focus → Can view All News for complete picture
- **Success criteria**: Tabs load instantly, Priority section shows 3-5 most critical items, Market section filters correctly for financial relevance

### News Source Management
- **Functionality**: Users can add news items via URL or paste text content, with AI automatically extracting and analyzing information
- **Purpose**: Flexible input methods accommodate different workflows and news sources
- **Trigger**: User clicks "Add News" button
- **Progression**: User clicks Add News → Dialog opens → Enters URL or pastes text → AI processes → Extracts metadata → Saves to appropriate category → Shows in feed with analysis
- **Success criteria**: URLs auto-fetch content, manual text accepts any format, both methods produce consistent categorized output

### Priority Scoring System
- **Functionality**: AI assigns numerical priority scores (1-10) based on market impact, urgency, and geopolitical significance
- **Purpose**: Quantifies importance to automatically surface most critical news first
- **Trigger**: Runs automatically during news analysis phase
- **Progression**: AI receives content → Analyzes market keywords, sentiment, entity mentions → Calculates composite priority score → Assigns category tags → Stores with metadata
- **Success criteria**: Scores consistently rank breaking market news 8-10, routine updates 4-6, and minor news 1-3

### Visual Priority Indicators
- **Functionality**: Color-coded badges and visual weight distinguish high-priority items from lower priority content
- **Purpose**: Enables instant visual scanning to identify critical news without reading scores
- **Trigger**: Renders automatically based on stored priority score
- **Progression**: System loads news item → Reads priority score → Applies color mapping (red=critical, orange=high, yellow=medium, blue=low) → Renders with appropriate visual weight
- **Success criteria**: Color mapping immediately apparent, high-priority items visually dominant without overwhelming design

## Edge Case Handling

- **Invalid URLs** - Show inline error with fallback to manual text entry option
- **AI Processing Failures** - Save news item with default "Uncategorized" status and manual override option
- **Duplicate News** - Detect similar titles/content and show "Already added" message (RSS feeds auto-deduplicate)
- **Empty Sections** - Display helpful empty state with suggestion to add news sources or fetch from RSS
- **Slow AI Response** - Show processing spinner with timeout after 30 seconds
- **Missing News Data** - Extract whatever fields available, mark missing fields as "Unknown"
- **RSS Feed Failures** - Silently skip failed feeds and continue processing available ones
- **No Enabled Feeds** - Disable "Fetch News" button and show warning when all feeds are toggled off

## Design Direction

The design should evoke a professional trading floor aesthetic - sharp, data-dense, and alert. Think Bloomberg Terminal meets modern minimalism. Users should feel informed, focused, and in control. The interface prioritizes speed and clarity over decoration, with strategic uses of color to signal urgency and importance.

## Color Selection

A high-contrast, terminal-inspired palette with accent colors that communicate urgency and financial data.

- **Primary Color**: Deep Navy Blue (oklch(0.25 0.05 250)) - Professional, stable, trustworthy financial atmosphere
- **Secondary Colors**: 
  - Charcoal Gray (oklch(0.35 0.01 250)) - Secondary surfaces and cards
  - Steel Gray (oklch(0.50 0.01 250)) - Muted text and borders
- **Accent Color**: Electric Cyan (oklch(0.75 0.15 200)) - Attention for CTAs and active states, suggesting real-time data flow
- **Priority Colors**:
  - Critical: Urgent Red (oklch(0.60 0.22 25)) - Breaking market-moving news
  - High: Alert Orange (oklch(0.70 0.18 50)) - Significant market news
  - Medium: Caution Yellow (oklch(0.80 0.15 90)) - Notable developments
  - Low: Info Blue (oklch(0.65 0.15 230)) - General updates
- **Foreground/Background Pairings**:
  - Background (Deep Navy #0B1426): White text (#FFFFFF) - Ratio 11.2:1 ✓
  - Primary (Deep Navy): White text (#FFFFFF) - Ratio 11.2:1 ✓
  - Accent (Electric Cyan #3DD5F3): Deep Navy text (#0B1426) - Ratio 6.8:1 ✓
  - Card (Charcoal #1E293B): White text (#FFFFFF) - Ratio 9.4:1 ✓

## Font Selection

The typography should convey precision, clarity, and technological sophistication appropriate for financial data presentation.

- **Primary**: IBM Plex Sans - Technical clarity with excellent readability for data-dense interfaces
- **Monospace**: JetBrains Mono - For timestamps, numerical data, and system information

**Typographic Hierarchy**:
- H1 (Section Headers): IBM Plex Sans Bold/24px/tight (-0.02em)
- H2 (News Titles): IBM Plex Sans SemiBold/18px/normal
- H3 (Card Headers): IBM Plex Sans Medium/16px/normal
- Body (News Summary): IBM Plex Sans Regular/14px/relaxed (1.6 line height)
- Caption (Metadata): IBM Plex Sans Regular/12px/wide (0.02em) uppercase
- Mono (Timestamps/Scores): JetBrains Mono Regular/13px/normal

## Animations

Animations should feel responsive and data-driven, with subtle transitions that maintain focus rather than distract.

- **Page Loads**: Smooth 200ms fade-in for news cards with 50ms stagger for list items
- **Tab Switches**: 150ms crossfade between sections with subtle slide (20px)
- **Priority Badges**: Gentle pulse animation (3s duration) on critical/high priority items
- **Add News**: Modal scales in 200ms with backdrop fade
- **Loading States**: Skeleton shimmer effect for AI processing (1.5s loop)
- **Hover States**: 100ms color transition on interactive elements

## Component Selection

- **Components**:
  - **Tabs** (shadcn) - Three-section navigation (All/Market/Priority) with custom styling for tech aesthetic
  - **Card** (shadcn) - News item containers with custom border colors for priority levels
  - **Dialog** (shadcn) - Add News modal with URL and text input options
  - **Badge** (shadcn) - Priority indicators and category tags with custom color variants
  - **Button** (shadcn) - Primary action for Add News, secondary for refresh/filters
  - **Textarea** (shadcn) - Manual news text entry
  - **Input** (shadcn) - URL input field
  - **Skeleton** (shadcn) - Loading states during AI analysis
  - **ScrollArea** (shadcn) - Smooth scrolling for news feeds
  - **Separator** (shadcn) - Dividing sections and metadata

- **Customizations**:
  - **NewsCard** - Custom component combining Card with priority color borders, badges, and structured metadata
  - **PriorityBadge** - Custom badge variant with color mapping and optional pulse animation
  - **EmptyState** - Custom component for empty sections with contextual messaging

- **States**:
  - Buttons: Default (cyan accent), Hover (brighter cyan with glow), Active (pressed cyan), Loading (spinner)
  - Cards: Default (subtle border), Hover (elevated shadow + border glow), Loading (skeleton shimmer)
  - Tabs: Inactive (muted gray), Active (cyan underline + white text), Hover (light cyan)
  - Inputs: Default (gray border), Focus (cyan border + glow), Error (red border), Filled (white text)

- **Icon Selection**:
  - Plus (Add News action)
  - Rss (RSS Feeds button)
  - Newspaper (All News tab)
  - TrendUp (Market News tab)
  - Lightning (Priority News tab)
  - ArrowsClockwise (Refresh/Fetch RSS feeds)
  - Link (URL input)
  - TextT (Text input)
  - Clock (Timestamp)
  - Tag (Category)
  - CheckCircle (Enabled feed indicator)

- **Spacing**:
  - Container padding: 6 (24px) on desktop, 4 (16px) on mobile
  - Card padding: 5 (20px) internal
  - Card gap: 4 (16px) between news items
  - Section gap: 8 (32px) between major sections
  - Inline gap: 2 (8px) for badges and metadata

- **Mobile**:
  - Tabs switch to scrollable horizontal layout with snap points
  - Cards stack vertically with full width
  - Add News button becomes fixed floating action button (bottom right)
  - Font sizes reduce by 2px for titles, 1px for body
  - Priority badges move below titles instead of inline
  - Reduced padding (4 → 3, 6 → 4) throughout
