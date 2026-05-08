import type { ExportedNode } from "./types";

function n(content: string, children: ExportedNode[] = [], daysAgo = 0): ExportedNode {
  return { content, createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(), children };
}

export const SEED_THOUGHTS: ExportedNode[] = [
  n("Morning Routine", [
    n("Wake up & stretch", [
      n("5 min full-body stretch"),
      n("Quick mindfulness check-in"),
      n("Drink a glass of water"),
    ]),
    n("Exercise", [
      n("20 min cardio", [
        n("Running or cycling outside"),
        n("Jump rope as indoor alternative"),
      ]),
      n("Strength training", [
        n("Push-ups: 3 sets of 20"),
        n("Plank: 3 x 45 seconds"),
        n("Bodyweight squats"),
      ]),
      n("Cool down & foam roll"),
    ]),
    n("Breakfast", [
      n("Oatmeal with berries and honey"),
      n("Coffee or green tea"),
      n("Daily vitamins & supplements"),
    ]),
    n("Plan the day", [
      n("Review task list"),
      n("Set top 3 priorities"),
      n("Check calendar & meetings"),
      n("5 min journaling"),
    ]),
  ], 4),

  n("Project Ideas", [
    n("Mobile apps", [
      n("Habit tracker", [
        n("Daily streaks & rewards"),
        n("Smart reminders"),
        n("Weekly progress charts"),
      ]),
      n("Budget manager", [
        n("Income & expense tracking"),
        n("Spending categories"),
        n("Monthly summary"),
      ]),
      n("Sleep journal", [
        n("Log sleep & wake times"),
        n("Mood correlation"),
      ]),
    ]),
    n("Side business", [
      n("Freelance writing", [
        n("Tech blogs"),
        n("Newsletter ghostwriting"),
      ]),
      n("Online tutoring"),
      n("Sell digital products", [
        n("Notion templates"),
        n("Design assets"),
        n("Mini ebooks"),
      ]),
    ]),
    n("Open source", [
      n("UI component library"),
      n("CLI developer tools"),
      n("Documentation generator"),
      n("VS Code extension"),
    ]),
  ], 3),

  n("Books to Read", [
    n("Fiction", [
      n("The Name of the Wind", [
        n("Epic fantasy — Patrick Rothfuss"),
        n("First in the Kingkiller Chronicle"),
      ]),
      n("Project Hail Mary", [
        n("Sci-fi survival — Andy Weir"),
        n("Great for audiobook"),
      ]),
      n("Dune — Frank Herbert"),
      n("The Long Way to a Small Angry Planet"),
    ]),
    n("Non-fiction", [
      n("Atomic Habits", [
        n("Build small daily habits"),
        n("Break bad patterns"),
        n("James Clear"),
      ]),
      n("Deep Work", [
        n("Eliminate distractions"),
        n("Block focus time"),
        n("Cal Newport"),
      ]),
      n("Thinking, Fast and Slow"),
      n("The Psychology of Money"),
    ]),
    n("Technical", [
      n("Clean Code — Robert Martin"),
      n("Designing Data-Intensive Applications"),
      n("The Pragmatic Programmer"),
      n("A Philosophy of Software Design"),
    ]),
  ], 2),

  n("Travel Wishlist", [
    n("Europe", [
      n("Italy", [
        n("Rome: Colosseum & Vatican"),
        n("Florence: Uffizi Gallery"),
        n("Amalfi Coast road trip"),
        n("Venice in early morning"),
      ]),
      n("Portugal", [
        n("Lisbon: Alfama district"),
        n("Porto wine cellars"),
        n("Sintra fairy-tale palaces"),
      ]),
      n("Iceland", [
        n("Northern lights"),
        n("Ring Road drive"),
        n("Blue Lagoon"),
      ]),
    ]),
    n("Asia", [
      n("Japan", [
        n("Tokyo street food & ramen"),
        n("Kyoto temples & bamboo groves"),
        n("Mount Fuji sunrise hike"),
        n("Shinkansen bullet train"),
      ]),
      n("Vietnam", [
        n("Hanoi old quarter"),
        n("Ha Long Bay cruise"),
        n("Hoi An lantern festival"),
      ]),
      n("Thailand: islands & temples"),
    ]),
    n("Americas", [
      n("Patagonia — Torres del Paine hike"),
      n("Machu Picchu at dawn"),
      n("New Orleans jazz & food scene"),
      n("Canadian Rockies in autumn"),
    ]),
  ], 1),

  n("Health Goals", [
    n("Cardio", [
      n("Run 5K without stopping", [
        n("Week 1–2: 1 km easy runs"),
        n("Week 3–4: 2 km intervals"),
        n("Week 5–6: 3 km steady"),
        n("Week 7–8: full 5K"),
      ]),
      n("Cycle 20 km on weekends"),
      n("30 min walk every day"),
    ]),
    n("Strength", [
      n("Gym 3× per week", [
        n("Monday: upper body push"),
        n("Wednesday: lower body"),
        n("Friday: pull & core"),
      ]),
      n("Yoga or stretching on rest days"),
      n("Track weight & reps progress"),
    ]),
    n("Nutrition", [
      n("Reduce sugar intake", [
        n("Cut sugary drinks"),
        n("Read food labels"),
        n("Fruit instead of sweets"),
      ]),
      n("Eat more vegetables", [
        n("Salad with every lunch"),
        n("Veggie-heavy dinners"),
      ]),
      n("8 glasses of water per day"),
    ]),
    n("Sleep", [
      n("In bed by 11 pm"),
      n("No screens 30 min before bed"),
      n("Target 7–8 hours"),
      n("Consistent wake time even on weekends"),
    ]),
  ], 0),
];
