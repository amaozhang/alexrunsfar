export const site = {
  title: 'Alex Runs Far',
  handle: 'alexrunsfar',
  url: 'https://alexrunsfar.com',
  tagline: 'Ultrarunner. Seattle.',
  // Generic, for meta descriptions where no race data is loaded.
  bio: `Alex runs far. Ultras since 2019, from a first fifty in the Finger Lakes to two hundred miles around Lake Tahoe — plus one hundred-miler he invented himself because nobody else was going to put it on.`,
  // Pending Cloudflare Email Routing on alexrunsfar.com — see README.
  email: 'alex@alexrunsfar.com',
  links: {
    strava: 'https://www.strava.com/athletes/44468706',
    linkedin: 'https://www.linkedin.com/in/alexmaozhang/',
    ultrasignup: 'https://ultrasignup.com/results_participant.aspx?fname=Alex&lname=Zhang',
  },
};

/** The bio with a live count of FINISHED ultras — upcoming races don't count. */
export const bioWith = (finishedCount: string) =>
  `Alex runs far. ${finishedCount[0].toUpperCase()}${finishedCount.slice(1)} ultras since 2019, ` +
  `from a first fifty in the Finger Lakes to two hundred miles around Lake Tahoe — plus one ` +
  `hundred-miler he invented himself because nobody else was going to put it on.`;

export const nav = [
  { href: '/photos', label: 'Photos' },
  { href: '/races', label: 'Races' },
  { href: '/writing', label: 'Writing' },
  { href: '/about', label: 'About' },
];
