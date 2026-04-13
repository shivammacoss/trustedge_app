export const phases = [
  {
    id: 1, num: 'I', title: 'FOUNDATIONS', subtitle: 'The Bedrock of Forex',
    duration: '6-8 Weeks', level: 'BEGINNER', totalMinutes: 170, color: '#2196f3',
    modules: [
      { id: '1.1', title: 'What Is the Forex Market?', topics: 6, minutes: 20 },
      { id: '1.2', title: 'Currency Pairs & Market Structure', topics: 6, minutes: 30 },
      { id: '1.3', title: 'Trading Sessions & Timing', topics: 6, minutes: 20 },
      { id: '1.4', title: 'Brokers, Platforms & Account Types', topics: 7, minutes: 35 },
      { id: '1.5', title: 'Core Mechanics: Pips, Lots & Orders', topics: 7, minutes: 30 },
      { id: '1.6', title: 'Risk & Money Management Fundamentals', topics: 6, minutes: 30 },
    ],
    quiz: [
      { id: 1, question: 'What is the daily trading volume of the forex market?', options: ['$1.5 Trillion', '$4.5 Trillion', '$7.5 Trillion', '$10 Trillion'], correct: 2 },
      { id: 2, question: 'Which session has the highest trading volume?', options: ['Asian Session', 'London Session', 'New York Session', 'Sydney Session'], correct: 1 },
      { id: 3, question: 'What does a pip represent in forex trading?', options: ['1% price change', 'Smallest price increment', 'A trading strategy', 'A type of order'], correct: 1 },
    ],
  },
  {
    id: 2, num: 'II', title: 'TECHNICAL ANALYSIS', subtitle: 'Reading the Chart Like a Map',
    duration: '6-8 Weeks', level: 'BEGINNER', totalMinutes: 210, color: '#2196f3',
    modules: [
      { id: '2.1', title: 'Candlestick Patterns & Price Action', topics: 8, minutes: 35 },
      { id: '2.2', title: 'Support & Resistance Levels', topics: 6, minutes: 30 },
      { id: '2.3', title: 'Trend Lines & Chart Patterns', topics: 7, minutes: 35 },
      { id: '2.4', title: 'Moving Averages & Indicators', topics: 8, minutes: 40 },
      { id: '2.5', title: 'Volume Analysis & Momentum', topics: 6, minutes: 35 },
      { id: '2.6', title: 'Multi-Timeframe Analysis', topics: 5, minutes: 35 },
    ],
    quiz: [
      { id: 1, question: 'What does a Doji candlestick indicate?', options: ['Strong uptrend', 'Market indecision', 'Strong downtrend', 'High volume'], correct: 1 },
      { id: 2, question: 'RSI above 70 signals what?', options: ['Oversold', 'Overbought', 'Neutral', 'Trend reversal'], correct: 1 },
    ],
  },
  {
    id: 3, num: 'III', title: 'FUNDAMENTAL ANALYSIS', subtitle: 'Understanding the Why Behind Price Moves',
    duration: '4-6 Weeks', level: 'INTERMEDIATE', totalMinutes: 180, color: '#2196f3',
    modules: [
      { id: '3.1', title: 'Economic Indicators & GDP', topics: 6, minutes: 30 },
      { id: '3.2', title: 'Central Banks & Interest Rates', topics: 7, minutes: 35 },
      { id: '3.3', title: 'Employment Data & Inflation', topics: 6, minutes: 30 },
      { id: '3.4', title: 'Geopolitical Events & News Trading', topics: 5, minutes: 25 },
      { id: '3.5', title: 'Intermarket Analysis', topics: 6, minutes: 30 },
      { id: '3.6', title: 'Combining Fundamental & Technical', topics: 6, minutes: 30 },
    ],
    quiz: [
      { id: 1, question: 'Which indicator measures inflation?', options: ['GDP', 'CPI', 'NFP', 'PMI'], correct: 1 },
    ],
  },
  {
    id: 4, num: 'IV', title: 'TRADING STRATEGIES', subtitle: 'Building Your Trading Edge',
    duration: '6-8 Weeks', level: 'INTERMEDIATE', totalMinutes: 240, color: '#14b8a6',
    modules: [
      { id: '4.1', title: 'Scalping Techniques', topics: 7, minutes: 40 },
      { id: '4.2', title: 'Day Trading Strategies', topics: 7, minutes: 40 },
      { id: '4.3', title: 'Swing Trading Methods', topics: 6, minutes: 35 },
      { id: '4.4', title: 'Position Trading & Carry Trade', topics: 6, minutes: 35 },
      { id: '4.5', title: 'Breakout & Range Trading', topics: 6, minutes: 35 },
      { id: '4.6', title: 'Strategy Backtesting & Optimization', topics: 7, minutes: 55 },
    ],
    quiz: [
      { id: 1, question: 'What timeframe is best for scalping?', options: ['Daily', '1-5 minute', '4 hour', 'Weekly'], correct: 1 },
    ],
  },
  {
    id: 5, num: 'V', title: 'RISK MANAGEMENT', subtitle: 'Protecting Your Capital',
    duration: '4-6 Weeks', level: 'INTERMEDIATE', totalMinutes: 160, color: '#f59e0b',
    modules: [
      { id: '5.1', title: 'Position Sizing & Risk-Reward', topics: 6, minutes: 30 },
      { id: '5.2', title: 'Stop Loss & Take Profit Strategies', topics: 6, minutes: 30 },
      { id: '5.3', title: 'Portfolio Diversification', topics: 5, minutes: 25 },
      { id: '5.4', title: 'Drawdown Management & Recovery', topics: 6, minutes: 30 },
      { id: '5.5', title: 'Correlation & Hedging', topics: 6, minutes: 30 },
    ],
    quiz: [
      { id: 1, question: 'Max risk per trade recommended?', options: ['10%', '5%', '1-2%', '25%'], correct: 2 },
    ],
  },
  {
    id: 6, num: 'VI', title: 'TRADING PSYCHOLOGY', subtitle: 'Mastering the Inner Game',
    duration: '4-6 Weeks', level: 'ADVANCED', totalMinutes: 150, color: '#3b82f6',
    modules: [
      { id: '6.1', title: 'Emotional Discipline', topics: 6, minutes: 30 },
      { id: '6.2', title: 'Overcoming Fear & Greed', topics: 5, minutes: 25 },
      { id: '6.3', title: 'Building a Trading Plan', topics: 7, minutes: 35 },
      { id: '6.4', title: 'Journaling & Performance Review', topics: 6, minutes: 30 },
      { id: '6.5', title: 'Mindset of Professional Traders', topics: 6, minutes: 30 },
    ],
    quiz: [
      { id: 1, question: 'What is revenge trading?', options: ['Trading with a plan', 'Trading after a loss to recover', 'Hedging a position', 'Copy trading'], correct: 1 },
    ],
  },
  {
    id: 7, num: 'VII', title: 'ALGORITHMIC TRADING', subtitle: 'Automation & Technology',
    duration: '6-8 Weeks', level: 'ADVANCED', totalMinutes: 200, color: '#a855f7',
    modules: [
      { id: '7.1', title: 'Intro to Algorithmic Trading', topics: 6, minutes: 30 },
      { id: '7.2', title: 'Expert Advisors (EAs)', topics: 7, minutes: 40 },
      { id: '7.3', title: 'Copy Trading & Social Trading', topics: 6, minutes: 30 },
      { id: '7.4', title: 'API Trading & Automation', topics: 7, minutes: 45 },
      { id: '7.5', title: 'Backtesting with Historical Data', topics: 6, minutes: 30 },
    ],
    quiz: [
      { id: 1, question: 'What is an Expert Advisor?', options: ['A human mentor', 'Automated trading script', 'A charting tool', 'A news feed'], correct: 1 },
    ],
  },
  {
    id: 8, num: 'VIII', title: 'PROFESSIONAL MASTERY', subtitle: 'The Elite Trader Blueprint',
    duration: '8+ Weeks', level: 'PROFESSIONAL', totalMinutes: 300, color: '#eab308',
    modules: [
      { id: '8.1', title: 'Institutional Trading Concepts', topics: 8, minutes: 50 },
      { id: '8.2', title: 'Order Flow & Market Microstructure', topics: 7, minutes: 45 },
      { id: '8.3', title: 'Multi-Asset & Cross-Market Analysis', topics: 7, minutes: 40 },
      { id: '8.4', title: 'Fund & Portfolio Management', topics: 8, minutes: 50 },
      { id: '8.5', title: 'Building a Trading Business', topics: 7, minutes: 40 },
      { id: '8.6', title: 'Live Market Practicum', topics: 10, minutes: 75 },
    ],
    quiz: [
      { id: 1, question: 'What is order flow analysis?', options: ['Technical analysis', 'Studying volume and market depth', 'Fundamental analysis', 'Chart patterns'], correct: 1 },
    ],
  },
];

export const TOTAL_MODULES = phases.reduce((sum, p) => sum + p.modules.length, 0);
export const TOTAL_MINUTES = phases.reduce((sum, p) => sum + p.totalMinutes, 0);
