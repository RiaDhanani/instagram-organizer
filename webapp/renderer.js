// renderer.js — Folder tree and post grid DOM rendering
window.IG = window.IG || {};

window.IG.Renderer = (() => {

  // ── Label normalisation map ────────────────────────────────────────────────
  // Maps lowercase/stripped variants → canonical display label.
  // Applied to category, subcategory, and tertiary before building the tree.
  // Each entry: stripped-lowercase-key → canonical label.
  // Key stripping: lowercase + remove spaces/hyphens/underscores/punctuation/apostrophes.
  const CANONICAL = {

    // ════════════════════════════════════════════════════════════════
    // ENTERTAINMENT — Movies
    // ════════════════════════════════════════════════════════════════

    // Girls Night
    'girlsnight': 'Girls Night', 'girlymovienight': 'Girls Night',
    'girlsmovinight': 'Girls Night', 'girlsmovienight': 'Girls Night',
    'girlsnightmovie': 'Girls Night', 'girlsnightmovies': 'Girls Night',
    'ladiesnight': 'Girls Night', 'girlsonly': 'Girls Night',

    // Holiday / Christmas
    'holiday': 'Holiday', 'holidaymovie': 'Holiday', 'holidaymovies': 'Holiday',
    'christmas': 'Holiday', 'christmasmovie': 'Holiday', 'christmasmovies': 'Holiday',
    'christmasfilm': 'Holiday', 'xmas': 'Holiday', 'xmasmovie': 'Holiday',
    'holidayfilm': 'Holiday', 'holidayseason': 'Holiday', 'festive': 'Holiday',
    'newyear': 'Holiday', 'newyearseve': 'Holiday', 'thanksgiving': 'Holiday',
    'halloween': 'Halloween', 'halloweenmovie': 'Halloween', 'halloweenmovies': 'Halloween',
    'spooky': 'Halloween', 'spookymovies': 'Halloween',

    // Romance
    'romance': 'Romance', 'romantic': 'Romance', 'romanticmovie': 'Romance',
    'romanticmovies': 'Romance', 'romanticfilm': 'Romance',
    'teenromance': 'Romance', 'teenromantic': 'Romance',
    'valentinesday': 'Romance', 'valentines': 'Romance', 'valentinesmovie': 'Romance',
    'valentinesdaymovie': 'Romance', 'lovemovie': 'Romance', 'lovemovies': 'Romance',
    'lovestory': 'Romance', 'lovestory': 'Romance',

    // Rom-Com
    'romcom': 'Rom-Com', 'romcoms': 'Rom-Com', 'romanticcomedy': 'Rom-Com',
    'romanticcomedies': 'Rom-Com',

    // Drama
    'drama': 'Drama', 'dramas': 'Drama', 'dramamovie': 'Drama',
    'emotionalmovie': 'Drama', 'tearjerker': 'Drama',

    // Horror / Thriller (movies)
    'horror': 'Horror', 'horrormovie': 'Horror', 'horrormovies': 'Horror',
    'scarymovie': 'Horror', 'scarymovies': 'Horror',
    'thriller': 'Thriller', 'thrillermovie': 'Thriller',
    'suspense': 'Thriller', 'mystery': 'Thriller',

    // Action / Adventure
    'action': 'Action', 'actionmovie': 'Action', 'actionmovies': 'Action',
    'adventure': 'Action', 'adventuremovie': 'Action',
    'actionadventure': 'Action',

    // Comedy
    'comedy': 'Comedy', 'comedymovie': 'Comedy', 'comedies': 'Comedy',
    'funnymoive': 'Comedy', 'funnymovie': 'Comedy',

    // Animation / Disney
    'animation': 'Animation', 'animated': 'Animation', 'animatedmovie': 'Animation',
    'disney': 'Animation', 'disneymovie': 'Animation', 'pixar': 'Animation',
    'cartoon': 'Animation', 'anime': 'Anime', 'animemovie': 'Anime',

    // Sci-Fi / Fantasy
    'scifi': 'Sci-Fi', 'sciencefiction': 'Sci-Fi', 'scifimovie': 'Sci-Fi',
    'fantasy': 'Fantasy', 'fantasymovie': 'Fantasy', 'epicfantasy': 'Fantasy',
    'superhero': 'Superhero', 'marvel': 'Superhero', 'dc': 'Superhero',

    // Documentary
    'documentary': 'Documentary', 'documentaries': 'Documentary',
    'docufilm': 'Documentary', 'docuseries': 'Documentary',

    // Bollywood
    'bollywood': 'Bollywood', 'bollywoodmovie': 'Bollywood',
    'hindimovie': 'Bollywood', 'indianmovie': 'Bollywood',

    // Teen / Coming of Age
    'teen': 'Teen', 'teenmovie': 'Teen', 'comingofage': 'Teen',
    'ya': 'Teen', 'youngadult': 'Teen',

    // Misc movies
    'movie': 'Movies', 'film': 'Movies', 'films': 'Movies',
    'mustwatch': 'Must Watch', 'mustwatchmovies': 'Must Watch',
    'watchlist': 'Watchlist', 'movienight': 'Movie Night',

    // ════════════════════════════════════════════════════════════════
    // ENTERTAINMENT — TV Shows
    // ════════════════════════════════════════════════════════════════

    'tvshows': 'TV Shows', 'tvshow': 'TV Shows', 'shows': 'TV Shows',
    'tvseries': 'TV Shows', 'webseries': 'TV Shows', 'series': 'TV Shows',

    // TV genres
    'tvdrama': 'Drama', 'tvromance': 'Romance',
    'kdrama': 'K-Drama', 'koreandrama': 'K-Drama', 'kdramas': 'K-Drama',
    'realitytv': 'Reality TV', 'realityshow': 'Reality TV', 'reality': 'Reality TV',
    'truecrime': 'True Crime', 'crimeseries': 'True Crime',
    'tvcomedy': 'Comedy', 'sitcom': 'Comedy',
    'tvthriller': 'Thriller', 'tvsuspense': 'Thriller',

    // ════════════════════════════════════════════════════════════════
    // WEDDING
    // ════════════════════════════════════════════════════════════════

    // Dances
    'dance': 'Dances', 'dancing': 'Dances', 'dances': 'Dances',
    'dancereel': 'Dances', 'dancereels': 'Dances', 'dancevideos': 'Dances',
    'weddingdance': 'Dances', 'weddingdances': 'Dances', 'bridesmaiddance': 'Dances',
    'flashmob': 'Dances', 'coupledhance': 'Dances', 'coupledance': 'Dances',

    // Haldi
    'haldi': 'Haldi', 'haldifunction': 'Haldi', 'haldicelebration': 'Haldi',
    'haldinight': 'Haldi', 'haldiday': 'Haldi', 'haldioutfit': 'Haldi',
    'haldioutfits': 'Haldi', 'haldivibes': 'Haldi', 'haldiinspo': 'Haldi',

    // Mandap / Venue / Garden
    'mandap': 'Mandap', 'mandapdecor': 'Mandap', 'mandapdesign': 'Mandap',
    'mandapinspo': 'Mandap', 'mandapideas': 'Mandap', 'mandapflowers': 'Mandap',
    'gardenwedding': 'Mandap', 'gardenstyle': 'Mandap',
    'gardenreception': 'Mandap', 'outdoorwedding': 'Mandap',
    'outdoorreception': 'Mandap', 'gardenparty': 'Mandap',

    // Sangeet
    'sangeet': 'Sangeet', 'sangeetnight': 'Sangeet', 'sangeetfunction': 'Sangeet',
    'sangeetperformance': 'Sangeet', 'sangeetoutfit': 'Sangeet',

    // Mehendi / Henna
    'mehendi': 'Mehendi', 'mehendidesign': 'Mehendi', 'mehendifunction': 'Mehendi',
    'mehendinight': 'Mehendi', 'mehendioutfit': 'Mehendi', 'mehendiinspo': 'Mehendi',
    'bridalmehendi': 'Mehendi', 'customizedbridalmehendi': 'Mehendi',
    'mehndi': 'Mehendi', 'mehndidesign': 'Mehendi', 'mehndifunction': 'Mehendi',
    'mehndinight': 'Mehendi', 'mehndioutfit': 'Mehendi',
    'henna': 'Mehendi', 'bridalhenna': 'Mehendi', 'hennadesign': 'Mehendi',

    // Makeup
    'bridalmakeup': 'Bridal Makeup', 'bridalmakeupartist': 'Bridal Makeup',
    'bridalmua': 'Bridal Makeup', 'weddingmakeup': 'Bridal Makeup',
    'makeupartist': 'Bridal Makeup', 'mua': 'Bridal Makeup',
    'bridalglam': 'Bridal Makeup', 'glamour': 'Bridal Makeup',

    // Outfits / Gown / Trousseau
    'bridalgown': 'Bridal Gown', 'bridaldress': 'Bridal Gown',
    'weddingdress': 'Bridal Gown', 'weddingown': 'Bridal Gown',
    'bridaltrousseau': 'Bridal Trousseau', 'trousseau': 'Bridal Trousseau',
    'trousseaushopping': 'Bridal Trousseau', 'trousseaugoals': 'Bridal Trousseau',
    'bridaloutfit': 'Bridal Outfits', 'bridallehenga': 'Bridal Outfits',
    'lehenga': 'Bridal Outfits', 'bridalsaree': 'Bridal Outfits',
    'bridallook': 'Bridal Outfits', 'bridalwear': 'Bridal Outfits',
    'groomoutfit': 'Groom Outfits', 'groomwear': 'Groom Outfits',
    'groomlook': 'Groom Outfits', 'groomplanning': 'Groom Outfits',

    // Decor
    'reception': 'Reception', 'weddingrecption': 'Reception', 'weddingrecption2': 'Reception',
    'receptiondecor': 'Reception', 'receptiondecor2': 'Reception',
    'ceremony': 'Ceremony', 'weddingceremony': 'Ceremony',
    'florals': 'Florals', 'floraldesign': 'Florals', 'floralinspo': 'Florals',
    'flowerwall': 'Florals', 'weddingflowers': 'Florals', 'floralarch': 'Florals',
    'bouquet': 'Florals', 'bridalbouquet': 'Florals',
    'tablesetting': 'Table Setting', 'tabledecor': 'Table Setting',
    'tablescapes': 'Table Setting', 'tablescape': 'Table Setting',
    'centerpiece': 'Table Setting', 'centerpieces': 'Table Setting',

    // Invitations / Planning
    'invitation': 'Invitations', 'invitations': 'Invitations',
    'weddinginvitation': 'Invitations', 'weddinginvitations': 'Invitations',
    'weddingcard': 'Invitations', 'weddingcards': 'Invitations',
    'stationery': 'Invitations', 'weddingstationery': 'Invitations',
    'savethedate': 'Invitations',

    // Poses / Photography
    'couplephoto': 'Poses', 'coupleposes': 'Poses', 'couplePose': 'Poses',
    'weddingphoto': 'Poses', 'weddingphotography': 'Poses',
    'bridalposes': 'Poses', 'weddingposes': 'Poses',
    'prewedding': 'Poses', 'preweddingshoot': 'Poses', 'preweddingphotos': 'Poses',

    // ════════════════════════════════════════════════════════════════
    // FASHION
    // ════════════════════════════════════════════════════════════════

    // Outfits / OOTD
    'ootd': 'Outfits', 'outfitoftheday': 'Outfits', 'outfitinspo': 'Outfits',
    'outfitideas': 'Outfits', 'lookoftheday': 'Outfits', 'look': 'Outfits',

    // Casual
    'casual': 'Casual', 'casualwear': 'Casual', 'casualoutfit': 'Casual',
    'casualstyle': 'Casual', 'casuallook': 'Casual', 'casualfashion': 'Casual',
    'everydaystyle': 'Casual', 'everydaylook': 'Casual',

    // Streetwear
    'streetwear': 'Streetwear', 'streetstyle': 'Streetwear',
    'streetfashion': 'Streetwear', 'urbanstyle': 'Streetwear',

    // Seasonal
    'autumn': 'Fall', 'autumnoutfits': 'Fall', 'autumnstyle': 'Fall',
    'autumnlooks': 'Fall', 'falloutfits': 'Fall', 'fallstyle': 'Fall',
    'falllooks': 'Fall', 'fallaesthetic': 'Fall',
    'summeroutfits': 'Summer', 'summerstyle': 'Summer', 'summerlooks': 'Summer',
    'summerfashion': 'Summer', 'summeraesthetic': 'Summer',
    'winteroutfits': 'Winter', 'winterstyle': 'Winter', 'winterlooks': 'Winter',
    'winterfashion': 'Winter', 'cozyoutfit': 'Winter',
    'springoutfits': 'Spring', 'springstyle': 'Spring', 'springfashion': 'Spring',

    // Night Out
    'nightout': 'Night Out', 'goingout': 'Night Out', 'eveningwear': 'Night Out',
    'datenight': 'Date Night', 'datenightoutfit': 'Date Night',
    'datenightlook': 'Date Night', 'datenightstyle': 'Date Night',

    // Work / Office
    'workwear': 'Work Wear', 'officewear': 'Work Wear', 'businesscasual': 'Work Wear',
    'officestyle': 'Work Wear', 'officelook': 'Work Wear',

    // Aesthetic styles
    'boho': 'Boho', 'bohemian': 'Boho', 'bohostyle': 'Boho', 'bohofashion': 'Boho',
    'minimalist': 'Minimalist', 'minimalstyle': 'Minimalist', 'cleangirlesthetic': 'Minimalist',
    'y2k': 'Y2K', 'y2kfashion': 'Y2K', 'y2kstyle': 'Y2K', 'y2kaesthetic': 'Y2K',
    'vintage': 'Vintage', 'vintagestyle': 'Vintage', 'retroestyle': 'Vintage',
    'retro': 'Vintage', 'retrofashion': 'Vintage', 'thriftflip': 'Vintage',
    'preppy': 'Preppy', 'preppystyle': 'Preppy',
    'coquette': 'Coquette', 'coquettestyle': 'Coquette', 'coquetteaesthetic': 'Coquette',
    'cottagecore': 'Cottagecore', 'cottagecoreaesthetic': 'Cottagecore',
    'darkacademia': 'Dark Academia', 'dark academia': 'Dark Academia',

    // Formal / Occasion
    'formal': 'Formal', 'formalwear': 'Formal', 'blacktie': 'Formal',
    'eveninggown': 'Formal', 'galadress': 'Formal',
    'party': 'Party', 'partyoutfit': 'Party', 'partylook': 'Party',
    'festiveoutfit': 'Festive', 'festivewear': 'Festive',

    // Activewear
    'activewear': 'Activewear', 'gymwear': 'Activewear', 'sportswear': 'Activewear',
    'athleticwear': 'Activewear', 'yogawear': 'Activewear',

    // ════════════════════════════════════════════════════════════════
    // FOOD
    // ════════════════════════════════════════════════════════════════

    // Cuisines
    'italian': 'Italian', 'italianfood': 'Italian', 'italiancuisine': 'Italian',
    'italian-american': 'Italian',
    'mexican': 'Mexican', 'mexicanfood': 'Mexican', 'mexicancuisine': 'Mexican',
    'texmex': 'Mexican',
    'indian': 'Indian', 'indianfood': 'Indian', 'indiancuisine': 'Indian',
    'southasian': 'Indian',
    'chinese': 'Chinese', 'chinesefood': 'Chinese', 'chinesecuisine': 'Chinese',
    'japanese': 'Japanese', 'japanesefood': 'Japanese', 'japanesecuisine': 'Japanese',
    'korean': 'Korean', 'koreanfood': 'Korean', 'koreancuisine': 'Korean',
    'thai': 'Thai', 'thaifood': 'Thai', 'thaicuisine': 'Thai',
    'mediterranean': 'Mediterranean', 'greek': 'Mediterranean', 'middleeastern': 'Mediterranean',
    'american': 'American', 'americanfood': 'American',
    'bbq': 'BBQ', 'barbecue': 'BBQ', 'grill': 'BBQ', 'grilled': 'BBQ',
    'pizza': 'Pizza', 'pizzaplace': 'Pizza', 'pizzashop': 'Pizza',
    'sushi': 'Sushi', 'sushirestaurant': 'Sushi', 'sushispot': 'Sushi',
    'vegan': 'Vegan', 'plantbased': 'Vegan', 'vegetarian': 'Vegan', 'veganfood': 'Vegan',

    // Cafe / Coffee
    'cafe': 'Cafe', 'cafes': 'Cafe', 'coffee': 'Cafe', 'coffeeshop': 'Cafe',
    'coffeeshops': 'Cafe', 'coffeeandcafe': 'Cafe', 'coffeeplace': 'Cafe',
    'coffeespot': 'Cafe', 'espresso': 'Cafe', 'latte': 'Cafe',

    // Brunch / Breakfast
    'brunch': 'Brunch', 'brunchspot': 'Brunch', 'brunchspots': 'Brunch',
    'brunchplace': 'Brunch', 'brunchinspo': 'Brunch',
    'breakfast': 'Brunch', 'breakfastspot': 'Brunch',

    // Desserts
    'dessert': 'Desserts', 'desserts': 'Desserts', 'sweets': 'Desserts',
    'bakery': 'Bakery', 'bakerys': 'Bakery', 'pastry': 'Bakery', 'pastries': 'Bakery',
    'cake': 'Bakery', 'cakes': 'Bakery',
    'icecream': 'Ice Cream', 'gelato': 'Ice Cream',

    // Pasta → Italian
    'pasta': 'Italian', 'pastarecipe': 'Italian', 'pastadish': 'Italian',
    'pastadishes': 'Italian', 'italianpasta': 'Italian', 'homemadepasta': 'Italian',
    'freshpasta': 'Italian', 'creamypasta': 'Italian', 'pastanight': 'Italian',

    // Bars / Nightlife — place type labels for Food > [City] > Bars
    'bars': 'Bars', 'bar': 'Bars', 'cocktailbar': 'Bars', 'cocktailbars': 'Bars',
    'winebar': 'Bars', 'pubbar': 'Bars', 'speakeasy': 'Bars', 'rooftopbar': 'Bars',
    'cocktails': 'Cocktails', 'cocktail': 'Cocktails',

    // Fine Dining
    'finedining': 'Fine Dining', 'upscale': 'Fine Dining', 'upscaledining': 'Fine Dining',
    'fancyrestaurant': 'Fine Dining', 'michelinstar': 'Fine Dining',

    // Fast Food / Casual Dining
    'fastfood': 'Fast Food', 'burger': 'Fast Food', 'burgers': 'Fast Food',

    // ════════════════════════════════════════════════════════════════
    // HOME DECOR
    // ════════════════════════════════════════════════════════════════

    'homedecor': 'Home Decor', 'homedesign': 'Home Decor', 'homeinspo': 'Home Decor',
    'interiordesign': 'Interior Design', 'interior': 'Interior Design',

    // Rooms
    'livingroom': 'Living Room', 'lounge': 'Living Room', 'sittingroom': 'Living Room',
    'bedroom': 'Bedroom', 'masterbed room': 'Bedroom', 'masterbedroom': 'Bedroom',
    'kitchen': 'Kitchen', 'kitchendesign': 'Kitchen', 'kitchendecor': 'Kitchen',
    'bathroom': 'Bathroom', 'bathroomdecor': 'Bathroom',
    'homeoffice': 'Home Office', 'officespace': 'Home Office', 'desksetup': 'Home Office',
    'entryway': 'Entryway', 'foyer': 'Entryway',
    'outdoor': 'Outdoor', 'patio': 'Outdoor', 'backyard': 'Outdoor', 'garden': 'Outdoor',

    // Styles
    'cozy': 'Cozy', 'hygge': 'Cozy', 'warmandcozy': 'Cozy',
    'minimalist': 'Minimalist', 'minimal': 'Minimalist', 'cleangirl': 'Minimalist',
    'modern': 'Modern', 'contemporary': 'Modern', 'modernhome': 'Modern',
    'boho': 'Boho', 'bohemian': 'Boho', 'bohomian': 'Boho',
    'vintage': 'Vintage', 'retro': 'Vintage', 'antique': 'Vintage',
    'darkacademia': 'Dark Academia', 'moody': 'Dark Academia', 'gothicdecor': 'Dark Academia',
    'scandinavian': 'Scandinavian', 'scandi': 'Scandinavian',
    'japandi': 'Japandi', 'japaneseminimalist': 'Japandi',
    'industrial': 'Industrial', 'industrialstyle': 'Industrial',
    'farmhouse': 'Farmhouse', 'rustic': 'Farmhouse',

    // ════════════════════════════════════════════════════════════════
    // FITNESS
    // ════════════════════════════════════════════════════════════════

    'pilates': 'Pilates', 'pilatesworkout': 'Pilates', 'reformerpilates': 'Pilates',
    'yoga': 'Yoga', 'yogapractice': 'Yoga', 'yogapose': 'Yoga',
    'gym': 'Gym', 'weighttraining': 'Gym', 'lifting': 'Gym', 'gymworkout': 'Gym',
    'hiit': 'HIIT', 'cardio': 'HIIT', 'hiitworkout': 'HIIT',
    'running': 'Running', 'jogging': 'Running', 'marathon': 'Running',
    'nutrition': 'Nutrition', 'mealprep': 'Nutrition', 'healthyfood': 'Nutrition',
    'wellness': 'Wellness', 'selfcare': 'Wellness', 'mentalhealth': 'Wellness',

    // ════════════════════════════════════════════════════════════════
    // EDUCATION
    // ════════════════════════════════════════════════════════════════

    'leetcode': 'Interview Prep', 'leetcodeproblems': 'Interview Prep',
    'codinginterview': 'Interview Prep', 'interviewprep': 'Interview Prep',
    'interviewquestions': 'Interview Prep', 'dsaproblems': 'Interview Prep',
    'datastructures': 'Interview Prep', 'algorithms': 'Interview Prep',
    'systemdesign': 'Interview Prep', 'technicalinterview': 'Interview Prep',

    'ai': 'AI & ML', 'artificialintelligence': 'AI & ML',
    'machinelearning': 'AI & ML', 'deeplearning': 'AI & ML',
    'aitools': 'AI & ML', 'chatgpt': 'AI & ML', 'llm': 'AI & ML',
    'gpt': 'AI & ML', 'aiproductivity': 'AI & ML',

    'productivity': 'Productivity', 'productivitytips': 'Productivity',
    'timemanagement': 'Productivity',
    'finance': 'Finance', 'personalfinance': 'Finance', 'investing': 'Finance',
    'sidehustle': 'Finance', 'moneytips': 'Finance',
    'selfimprovement': 'Self-Help', 'selfhelp': 'Self-Help', 'growthmindset': 'Self-Help',
    'motivation': 'Self-Help', 'mindset': 'Self-Help',
    'career': 'Career', 'careertips': 'Career', 'careerdevelopment': 'Career',
    'jobsearch': 'Career', 'resume': 'Career',

    // ════════════════════════════════════════════════════════════════
    // TRAVEL
    // ════════════════════════════════════════════════════════════════

    // Nature and Road Trip are the same subcategory
    'nature': 'Nature & Road Trip', 'naturewalk': 'Nature & Road Trip',
    'naturetrip': 'Nature & Road Trip', 'naturephotography': 'Nature & Road Trip',
    'outdoors': 'Nature & Road Trip', 'outdoortrip': 'Nature & Road Trip',
    'hiking': 'Nature & Road Trip', 'hikingtrip': 'Nature & Road Trip',
    'roadtrip': 'Nature & Road Trip', 'roadtrips': 'Nature & Road Trip',
    'road trip': 'Nature & Road Trip',

    // ════════════════════════════════════════════════════════════════
    // MISC
    // ════════════════════════════════════════════════════════════════

    'tvshows': 'TV Shows', 'tvshow': 'TV Shows', 'webseries': 'TV Shows',
  };

  // Prefix rules — checked after exact map misses.
  // Order matters: longer/more-specific prefixes first.
  // A prefix match means "anything starting with X belongs to canonical Y".
  const PREFIX_RULES = [
    // Wedding ceremonies & functions
    ['haldi',           'Haldi'],
    ['sangeet',         'Sangeet'],
    ['mehendi',         'Mehendi'],
    ['mehndi',          'Mehendi'],
    ['henna',           'Mehendi'],
    ['mandap',          'Mandap'],
    ['gardenwebbing',   'Mandap'],  // gardenWedding variants
    ['gardenwedding',   'Mandap'],
    // Entertainment
    ['girlsnight',      'Girls Night'],
    ['girlymovie',      'Girls Night'],
    ['ladiesnight',     'Girls Night'],
    ['christmas',       'Holiday'],
    ['xmas',            'Holiday'],
    ['halloween',       'Halloween'],
    ['romanticcomedy',  'Rom-Com'],
    ['romcom',          'Rom-Com'],
    ['valentines',      'Romance'],
    ['bollywood',       'Bollywood'],
    ['kdrama',          'K-Drama'],
    ['koreandrama',     'K-Drama'],
    // Fashion aesthetics
    ['darkacademia',    'Dark Academia'],
    ['cottagecore',     'Cottagecore'],
    ['coquette',        'Coquette'],
    ['y2k',             'Y2K'],
    // Education
    ['leetcode',        'Interview Prep'],
    ['interviewprep',   'Interview Prep'],
    ['codinginterview', 'Interview Prep'],
    ['systemdesign',    'Interview Prep'],
    ['machinelearning', 'AI & ML'],
    ['deeplearning',    'AI & ML'],
    ['artificialint',   'AI & ML'],
    // Food
    ['coffeeshop',      'Cafe'],
    ['brunchspot',      'Brunch'],
  ];

  // Cuisine alias map — collapses specific dishes/styles into their parent cuisine.
  // Applied to the cuisine word in "[City] [Cuisine]" restaurant tertiary labels.
  const CUISINE_MERGES = {
    'sushi': 'Japanese', 'ramen': 'Japanese', 'noodles': 'Japanese',
    'hibachi': 'Japanese', 'teriyaki': 'Japanese',
    'pizza': 'Italian', 'pasta': 'Italian',
    'tacos': 'Mexican', 'taco': 'Mexican', 'burrito': 'Mexican',
    'burgers': 'American', 'burger': 'American', 'bbq': 'American',
    'pho': 'Vietnamese', 'banh': 'Vietnamese',
    'dumplings': 'Chinese', 'dimsum': 'Chinese',
    'curry': 'Indian', 'tikka': 'Indian',
  };

  function normalizeLabel(str) {
    if (!str) return null;
    const s = String(str).trim();
    if (!s || s.toLowerCase() === 'null') return null;
    // Strip spaces, hyphens, underscores, punctuation, apostrophes, slashes
    const key = s.toLowerCase().replace(/[\s\-_.,!'''\u2018\u2019&/\\]/g, '');
    // 1. Exact map lookup
    if (CANONICAL[key]) return CANONICAL[key];
    // 2. Prefix fallback — handles "haldi ceremony", "sangeet night", etc.
    for (const [prefix, canonical] of PREFIX_RULES) {
      if (key.startsWith(prefix)) return canonical;
    }
    // 3. "[City] [Cuisine]" alias — e.g. "Chicago Sushi" → "Chicago Japanese"
    const parts = s.trim().split(/\s+/);
    if (parts.length === 2) {
      const cuisineAlias = CUISINE_MERGES[parts[1].toLowerCase()];
      if (cuisineAlias) return `${parts[0]} ${cuisineAlias}`;
    }
    return s.trim();
  }

  // ── Cross-category reclassification ────────────────────────────────────────
  // Fixes posts placed in wrong buckets and migrates old 3-field data to new 4-field structure.
  // Old structure: Food > Restaurants > "Chicago Italian"
  // New structure: Food > Chicago > Restaurants > Italian
  // Old structure: Food > Recipes > Italian (tertiary)
  // New structure: Food > Recipes > null > Italian (quaternary)
  const CUISINE_STRINGS = new Set([
    'Italian','Mexican','Indian','Japanese','Korean','Chinese','Thai','Vietnamese',
    'Mediterranean','American','Healthy','Baking','Drinks',
    'Dessert','French','BBQ','Pizza','Sushi',
  ]);
  const PLACE_TYPES = new Set(['Restaurants','Bars','Cafes & Brunch','Cafes','Date Night','Clubs']);

  function reclassify(cat, sub, ter, quat = null) {
    const catKey = (cat || '').toLowerCase().replace(/[\s\-_]/g, '');

    // Tech / Technology → Education > Technology
    if (catKey === 'tech' || catKey === 'technology') {
      return { cat: 'Education', sub: sub || 'Technology', ter, quat };
    }

    // Wedding > Invitations (subcategory) → Wedding > Planning > Invitations
    if (cat === 'Wedding' && /^invitation/i.test(sub || '')) {
      return { cat: 'Wedding', sub: 'Planning', ter: 'Invitations', quat: null };
    }

    // Wedding > Planning with gown/trousseau tertiary → Wedding > Outfits
    if (cat === 'Wedding' && sub === 'Planning') {
      const t = (ter || '').toLowerCase();
      if (/gown|trousseau|dress|lehenga|outfit|attire/.test(t)) {
        return { cat: 'Wedding', sub: 'Outfits', ter, quat: null };
      }
    }

    // Wedding > Makeup with gown/dress tertiary → Wedding > Outfits
    if (cat === 'Wedding' && sub === 'Makeup') {
      const t = (ter || '').toLowerCase();
      if (/gown|dress|lehenga|trousseau/.test(t)) {
        return { cat: 'Wedding', sub: 'Outfits', ter, quat: null };
      }
    }

    // ── Food migrations ────────────────────────────────────────────────────────

    // OLD: Food > Recipes > "Italian" (cuisine in tertiary, no quaternary)
    // NEW: Food > Recipes > null > "Italian"
    if (cat === 'Food' && sub === 'Recipes' && ter && !quat && CUISINE_STRINGS.has(ter)) {
      return { cat: 'Food', sub: 'Recipes', ter: null, quat: ter };
    }

    // Merge Cafes / Cafe / Brunch place types into "Cafes & Brunch" — city posts only, not Recipes
    if (cat === 'Food' && sub !== 'Recipes' && (ter === 'Cafes' || ter === 'Cafe' || ter === 'Brunch')) {
      return { cat, sub, ter: 'Cafes & Brunch', quat };
    }
    // Restaurants > Brunch (cuisine) → Cafes & Brunch place type
    if (cat === 'Food' && ter === 'Restaurants' && quat === 'Brunch') {
      return { cat, sub, ter: 'Cafes & Brunch', quat: null };
    }

    // OLD: Food > Restaurants > "Chicago Italian"
    // NEW: Food > Chicago > Restaurants > Italian
    if (cat === 'Food' && sub === 'Restaurants' && ter && !quat) {
      if (/^has\s/i.test(ter) || /^restaurant/i.test(ter)) {
        return { cat: 'Food', sub: 'Restaurants', ter: null, quat: null };
      }
      const parts = ter.trim().split(/\s+/);
      if (parts.length >= 2) {
        const city = parts[0];
        const cuisine = parts.slice(1).join(' ');
        // If second word looks like a place type (Bar → Bars)
        const placeWord = cuisine === 'Bar' ? 'Bars' : (PLACE_TYPES.has(cuisine) ? cuisine : 'Restaurants');
        const cuisineQuat = PLACE_TYPES.has(cuisine) ? null : (CUISINE_STRINGS.has(cuisine) ? cuisine : null);
        return { cat: 'Food', sub: city, ter: placeWord, quat: cuisineQuat };
      }
      // Single word tertiary — treat as city
      return { cat: 'Food', sub: ter, ter: 'Restaurants', quat: null };
    }

    // NEW data: Food > [City] > Bars or Restaurants — already correct, just pass through
    // No action needed; falls through to return below.

    // Other > food/bar subcategory → Food > Unknown City > Restaurants
    if (catKey === 'other') {
      const subKey = (sub || '').toLowerCase().replace(/[\s\-_]/g, '');
      if (/restaurant|cafe|bar|diner|eatery|bistro|tavern|pizzeria|sushi|ramen|korean|italian|mexican|indian|chinese|japanese|thai|mediterranean|american|brunch|bakery|dessert|cocktail|speakeasy/.test(subKey)) {
        return { cat: 'Food', sub: 'Unknown City', ter: 'Restaurants', quat: ter || null };
      }
    }

    return { cat, sub, ter, quat };
  }

  // ── Build nested tree from categorized posts ───────────────────────────────
  function buildTree(posts) {
    const tree = {};

    for (const post of posts) {
      const rawCat = post.categorization?.category || 'Uncategorized';
      const rawSub = post.categorization?.subcategory || 'Other';
      const rawTer = post.categorization?.tertiary || null;
      const rawQuat = post.categorization?.quaternary || null;

      // Normalize labels first, then reclassify
      const normCat = normalizeLabel(rawCat) || 'Uncategorized';
      const normSub = normalizeLabel(rawSub) || 'Other';
      const normTer = normalizeLabel(rawTer);
      const normQuat = normalizeLabel(rawQuat);

      const { cat, sub, ter: _ter, quat: _quat } = reclassify(normCat, normSub, normTer, normQuat);
      // Folder-file rule: never create a child node with the same name as its parent
      let ter = (_ter === sub) ? null : _ter;
      let quat = (_quat === ter || _quat === sub) ? null : _quat;

      // Fix existing data: reclassify Recipes posts using priority rules
      if (cat === 'Food' && sub === 'Recipes') {
        const cuisineVal = quat || ter;
        const tags = post.categorization?.tags || [];
        const signal = [...tags, post.alt_text || ''].join(' ').toLowerCase();
        const SWEET_SIGNAL  = /waffle|pancake|crepe|muffin|bak[ei]|cake|cookie|brownie|sweet|dessert|granola|overnight.?oat|chocolate|syrup|honey|treat|no.?bake/;
        const BRUNCH_LIKE   = /^(Cafe & Brunch|Cafes & Brunch|Brunch|Breakfast)$/;

        // Rule 1: any tag contains "salad" substring → Healthy
        if (tags.some(t => t.toLowerCase().includes('salad'))) {
          ter = null; quat = 'Healthy';
        }
        // Rule 2: paneer or peri peri in tags → Indian
        else if (tags.some(t => /paneer|peri.?peri/.test(t.toLowerCase()))) {
          ter = null; quat = 'Indian';
        }
        // Brunch / Breakfast / Cafe & Brunch → remap to correct cuisine
        else if (BRUNCH_LIKE.test(cuisineVal)) {
          let remapped = 'American';
          if (/pizza/.test(signal))            remapped = 'Italian';
          else if (SWEET_SIGNAL.test(signal))  remapped = 'Baking';
          else if (/smoothie|acai|grain.?bowl|salad/.test(signal)) remapped = 'Healthy';
          ter = null; quat = remapped;
        }
        // Savory signal overrides Baking — these are never sweet
        const SAVORY_OVERRIDE = /broccoli|cauliflower|carrot|spinach|kale|vegetable|veggie|zucchini|potato|cheese(?!cake)|avocado|chickpea|lentil|bean|tofu|chicken(?!cookie)|beef|lamb|pork|fish|shrimp|prawn|egg(?!nog)|bite|appetizer|finger.?food|dip\b/;
        if (cuisineVal === 'Baking' && (SAVORY_OVERRIDE.test(signal) || !SWEET_SIGNAL.test(signal))) {
          ter = null; quat = 'Healthy';
        }
        // Healthy + sweet signal → Baking
        else if (cuisineVal === 'Healthy' && SWEET_SIGNAL.test(signal)) {
          ter = null; quat = 'Baking';
        }
        // Dessert(s) → Baking
        else if (/^Desserts?$/.test(cuisineVal)) {
          ter = null; quat = 'Baking';
        }
      }

      if (!tree[cat]) tree[cat] = { __posts: [], __count: 0 };
      tree[cat].__count++;

      if (!tree[cat][sub]) tree[cat][sub] = { __posts: [], __count: 0 };
      tree[cat][sub].__count++;

      if (ter) {
        if (!tree[cat][sub][ter]) tree[cat][sub][ter] = { __posts: [], __count: 0 };
        tree[cat][sub][ter].__count++;

        if (quat) {
          if (!tree[cat][sub][ter][quat]) tree[cat][sub][ter][quat] = { __posts: [], __count: 0 };
          tree[cat][sub][ter][quat].__posts.push(post);
          tree[cat][sub][ter][quat].__count++;
        } else {
          tree[cat][sub][ter].__posts.push(post);
        }
      } else if (quat) {
        // ter=null but quat set (e.g. Food > Recipes > null > Italian)
        // Promote quat to the tertiary slot
        if (!tree[cat][sub][quat]) tree[cat][sub][quat] = { __posts: [], __count: 0 };
        tree[cat][sub][quat].__posts.push(post);
        tree[cat][sub][quat].__count++;
      } else {
        tree[cat][sub].__posts.push(post);
      }
    }

    return tree;
  }

  // ── SVG icons ──────────────────────────────────────────────────────────────
  const ICON_FOLDER_CLOSED = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3A1.5 1.5 0 0 0 0 4.5v8A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H7.621a1.5 1.5 0 0 1-1.06-.44L5.5 3H1.5Z"/></svg>`;
  const ICON_FOLDER_OPEN   = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v.64c.57.265.94.876.856 1.546l-.64 5.124A2.5 2.5 0 0 1 12.733 15H3.267a2.5 2.5 0 0 1-2.482-2.19l-.64-5.124A1.5 1.5 0 0 1 1 6.14V3.5Zm1 2.5h12v-.5a.5.5 0 0 0-.5-.5H9c-.964 0-1.71-.629-2.174-1.154C6.374 3.334 5.82 3 5.264 3H2.5a.5.5 0 0 0-.5.5V6Zm-.367 1a.5.5 0 0 0-.496.562l.64 5.124A1.5 1.5 0 0 0 3.267 14h9.466a1.5 1.5 0 0 0 1.489-1.314l.64-5.124A.5.5 0 0 0 14.367 7H1.633Z"/></svg>`;
  const ICON_DOT           = `<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="2.5"/></svg>`;
  const ICON_CHEVRON       = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/></svg>`;

  // ── Render folder tree ─────────────────────────────────────────────────────
  function renderTree(tree, container, onSelect) {
    container.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'folder-tree';

    const sortedCats = Object.keys(tree).filter((k) => !k.startsWith('__')).sort();

    for (const cat of sortedCats) {
      const catNode = tree[cat];
      const catLi = document.createElement('li');
      catLi.className = 'folder-item';

      const sortedSubs = Object.keys(catNode).filter((k) => !k.startsWith('__')).sort();
      let subUl = null;

      if (sortedSubs.length > 0) {
        subUl = document.createElement('ul');
        subUl.className = 'folder-children';
        subUl.style.display = 'none';

        for (const sub of sortedSubs) {
          const subNode = catNode[sub];
          const subLi = document.createElement('li');
          subLi.className = 'folder-item';

          const sortedTers = Object.keys(subNode).filter((k) => !k.startsWith('__')).sort();
          let terUl = null;

          if (sortedTers.length > 0) {
            terUl = document.createElement('ul');
            terUl.className = 'folder-children';
            terUl.style.display = 'none';

            for (const ter of sortedTers) {
              const terNode = subNode[ter];
              const terLi = document.createElement('li');
              terLi.className = 'folder-item';

              const sortedQuats = Object.keys(terNode).filter((k) => !k.startsWith('__')).sort();
              let quatUl = null;

              if (sortedQuats.length > 0) {
                quatUl = document.createElement('ul');
                quatUl.className = 'folder-children';
                quatUl.style.display = 'none';

                for (const quat of sortedQuats) {
                  const quatNode = terNode[quat];
                  const quatLi = document.createElement('li');
                  quatLi.className = 'folder-item';
                  quatLi.appendChild(makeFolderHeader(quat, quatNode.__count, [cat, sub, ter, quat], onSelect, quatNode, null));
                  quatUl.appendChild(quatLi);
                }
              }

              terLi.appendChild(makeFolderHeader(ter, terNode.__count, [cat, sub, ter], onSelect, terNode, quatUl, terNode.__count >= 2));
              if (quatUl) terLi.appendChild(quatUl);
              terUl.appendChild(terLi);
            }
          }

          subLi.appendChild(makeFolderHeader(sub, subNode.__count, [cat, sub], onSelect, subNode, terUl, subNode.__count >= 2));
          if (terUl) subLi.appendChild(terUl);
          subUl.appendChild(subLi);
        }
      }

      catLi.appendChild(makeFolderHeader(cat, catNode.__count, [cat], onSelect, catNode, subUl));
      if (subUl) catLi.appendChild(subUl);
      ul.appendChild(catLi);
    }

    container.appendChild(ul);
  }

  // forceFolder: subcategory nodes always show the folder icon even with no tertiary children
  function makeFolderHeader(label, count, path, onSelect, node, childUl, forceFolder = false) {
    const isLeaf = !childUl;
    const showFolder = !isLeaf || forceFolder;
    const div = document.createElement('div');
    div.className = 'folder-header' + (isLeaf && !forceFolder ? ' folder-header-leaf' : '');
    div.dataset.path = path.join('/');

    // Chevron — rotates when open; hidden when there are no children to expand
    const chevron = document.createElement('span');
    chevron.className = 'folder-chevron' + (isLeaf ? ' folder-chevron-hidden' : '');
    chevron.innerHTML = ICON_CHEVRON;
    div.appendChild(chevron);

    // Icon — folder for category/subcategory nodes, dot only for tertiary leaves
    const iconEl = document.createElement('span');
    iconEl.className = showFolder ? 'folder-icon' : 'folder-icon-leaf';
    iconEl.innerHTML = showFolder ? ICON_FOLDER_CLOSED : ICON_DOT;
    div.appendChild(iconEl);

    const name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = label;
    div.appendChild(name);

    const badge = document.createElement('span');
    badge.className = 'folder-count';
    badge.textContent = count;
    div.appendChild(badge);

    div.addEventListener('click', () => {
      if (childUl) {
        const isOpen = childUl.style.display !== 'none';
        childUl.style.display = isOpen ? 'none' : '';
        chevron.classList.toggle('open', !isOpen);
        iconEl.innerHTML = isOpen ? ICON_FOLDER_CLOSED : ICON_FOLDER_OPEN;
      }
      document.querySelectorAll('.folder-header.active').forEach((el) => el.classList.remove('active'));
      div.classList.add('active');
      onSelect(collectPosts(node), path.join(' › '));
    });

    return div;
  }

  function collectPosts(node) {
    const posts = [...(node.__posts || [])];
    for (const key of Object.keys(node)) {
      if (!key.startsWith('__')) {
        posts.push(...collectPosts(node[key]));
      }
    }
    return posts;
  }

  // ── Render post grid ───────────────────────────────────────────────────────
  function renderGrid(posts, container) {
    container.innerHTML = '';

    if (!posts || posts.length === 0) {
      container.innerHTML = '<div class="empty-state">No posts found</div>';
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const post of posts) {
      const card = document.createElement('a');
      card.className = 'post-card';
      card.href = post.post_url;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.style.cssText = 'display:flex;flex-direction:column;text-decoration:none;background:#1a1a1a;border-radius:10px;overflow:hidden;border:1px solid #2a2a2a;';

      const thumb = document.createElement('div');
      thumb.className = 'post-thumb';
      thumb.style.cssText = 'width:100%;height:160px;background:#1e1e1e;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0;';

      if (post.thumbnail_src) {
        const img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0;';
        img.alt = post.alt_text || '';
        img.loading = 'lazy';
        img.onerror = function () { this.remove(); };
        img.src = post.thumbnail_src;
        thumb.appendChild(img);
      }

      const placeholder = document.createElement('span');
      placeholder.textContent = '📷';
      placeholder.style.cssText = 'font-size:28px;opacity:0.15;';
      thumb.appendChild(placeholder);

      if (post.post_type && post.post_type !== 'photo') {
        const badge = document.createElement('span');
        badge.className = 'post-type-badge';
        badge.textContent = post.post_type;
        thumb.appendChild(badge);
      }

      card.appendChild(thumb);

      const info = document.createElement('div');
      info.className = 'post-info';
      info.style.cssText = 'padding:8px;min-height:32px;display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start;';

      const tags = post.categorization?.tags || [];
      const cat = post.categorization?.category;
      if (tags.length > 0) {
        const tagRow = document.createElement('div');
        tagRow.className = 'post-tags';
        for (const tag of tags.slice(0, 3)) {
          const t = document.createElement('span');
          t.className = 'tag';
          t.textContent = tag;
          tagRow.appendChild(t);
        }
        info.appendChild(tagRow);
      } else if (cat) {
        const catSpan = document.createElement('span');
        catSpan.className = 'post-category-label';
        catSpan.textContent = cat;
        info.appendChild(catSpan);
      } else {
        const slug = document.createElement('span');
        slug.className = 'post-slug';
        const match = post.post_url.match(/\/(p|reel|tv)\/([^/]+)/);
        slug.textContent = match ? `/${match[1]}/${match[2].slice(0, 8)}…` : 'View post';
        info.appendChild(slug);
      }

      card.appendChild(info);
      fragment.appendChild(card);
    }

    container.appendChild(fragment);
  }

  return { buildTree, renderTree, renderGrid, collectPosts };
})();
