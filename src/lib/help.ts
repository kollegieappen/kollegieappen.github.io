// Hjælpetekster: én side pr. skærm, roller, FAQ og små tips (ⓘ).
import type { Lang } from './i18n'

export type HelpSection = { title: string; items: string[] }
export type HelpPage = { title: string; intro: string; sections: HelpSection[] }
export type Role = { title: string; who: string; can: string[]; how: string }
export type Faq = { q: string; a: string }
export type HelpContent = {
  pages: Record<string, HelpPage>
  roles: Record<string, Role>
  faq: Faq[]
  tips: Record<string, string>
}

const da: HelpContent = {
  pages: {
    shopping: {
      title: 'Indkøb',
      intro: 'Gangens fælles indkøbs- og huskeliste. Alle på gangen ser den samme liste, og den opdateres med det samme.',
      sections: [
        { title: 'Brug listen', items: [
          'Skriv det, der mangler, i feltet øverst og tryk Tilføj.',
          'Tryk på en vare, når den er købt. Den flyttes ned under "Købt".',
          'Tryk på en købt vare igen, hvis den alligevel mangler.',
          '"Fjern købte" rydder alle købte varer fra listen.'
        ] },
        { title: 'Giv gangen besked', items: [
          '"Giv gangen besked" sender en notifikation til alle på gangen med det, der mangler.',
          'Kun dem, der har slået notifikationer til, får beskeden. Du får ikke selv beskeden.'
        ] }
      ]
    },
    calendar: {
      title: 'Kalender',
      intro: 'Events for gangen, hele kollegiet og jeres venskabskollegier, samt beboernes fødselsdage.',
      sections: [
        { title: 'Visninger og filtre', items: [
          'Skift mellem liste ☰ og måned ▦ øverst til højre.',
          'I månedsvisningen viser prikken antal events, og 🎂 viser fødselsdage. Tryk på en dag for at se den.',
          'Filtrér på Alle, Gang, Kollegie eller Venskab.'
        ] },
        { title: 'Opret og redigér', items: [
          'Tryk "+ Nyt event" og vælg, hvem eventet er for: din gang, hele kollegiet eller venskabskollegierne.',
          'Den, der oprettede eventet, kan redigere og slette det. Det kan moderatorer, bestyrelsen, administrationen og superadmin også.',
          'Man kan ikke flytte et event til en anden gruppe bagefter. Slet det og opret et nyt.'
        ] },
        { title: 'Reaktioner og kommentarer', items: [
          '❤️ og ❌ viser, hvad folk synes, fx om de kommer. Du kan vælge én af dem og skifte når som helst.',
          '💬 åbner kommentarerne. Alle, der kan se eventet, kan skrive.'
        ] }
      ]
    },
    board: {
      title: 'Opslag',
      intro: 'Opslagstavler for gangen, hele kollegiet og venskabskollegier, plus den anonyme brevkasse.',
      sections: [
        { title: 'Fanerne', items: [
          'Gangen: kun for beboerne på din gang.',
          'Brevkasse: anonyme beskeder til gangen.',
          'Kollegiet ("town square"): for alle beboere på kollegiet. Meddelelser fra bestyrelse og administration ligger øverst.',
          'Venskab: deles med jeres venskabskollegier.'
        ] },
        { title: 'Søg og filtrér', items: [
          'Søg i teksten i opslagene med feltet over listen.',
          'Tryk "Filter" for at vælge tidsrum: i dag, seneste 7 eller 30 dage, en bestemt dato eller fra–til.',
          'Under Kollegiet kan du filtrere på gang, og under Venskab på kollegie.'
        ] },
        { title: 'Typer af opslag', items: [
          'Under Kollegiet og Venskab kan du vælge Opslag eller Fremleje. Vælg "Kun fremleje" eller "Uden fremleje" over listen.',
          'Bestyrelsen og administrationen kan også lave en Meddelelse, som vises øverst med 📣.'
        ] },
        { title: 'Afstemninger', items: [
          'Tryk "📊 Tilføj afstemning" før du slår op, og skriv 2–8 svarmuligheder.',
          'Hver person har én stemme og kan skifte den. Procenterne vises, når man har stemt.'
        ] },
        { title: 'Redigér og slet', items: [
          'Du kan redigere dine egne opslag. Der står "redigeret" ved tidspunktet.',
          'Moderatorer kan slette opslag på gangen. Bestyrelsen og administrationen kan slette opslag på kollegiet.'
        ] }
      ]
    },
    mailbox: {
      title: 'Anonym brevkasse',
      intro: 'Skriv til gangen uden at vise dit navn – fx hvis noget er svært at tage op direkte.',
      sections: [
        { title: 'Anonymitet', items: [
          'Ingen beboere eller moderatorer kan se, hvem der skrev en besked.',
          'Afsenderen gemmes skjult. Kun administrationen kan se den, og kun hvis beskeden er rapporteret til administrationen. Det bliver logget hver gang.'
        ] },
        { title: 'Rapportér misbrug', items: [
          'Tryk "Rapportér" på en besked og vælg, om rapporten skal til moderatorerne eller administrationen.',
          'Moderatorer ser rapporterne øverst i brevkassen og kan slette beskeden eller markere rapporten som løst.'
        ] }
      ]
    },
    duties: {
      title: 'Tjanser',
      intro: 'Faste opgaver på skift: rengøring, fællesspisning, skrald og lignende.',
      sections: [
        { title: 'For alle', items: [
          'Øverst står din næste tur. Under den ses planen for hele gangen.',
          'Du får en påmindelse samme dag eller dagen før, hvis du har slået notifikationer til.',
          'Har tjansen tilmelding (fx fællesspisning), trykker du "Jeg er med". Fold listen ud for at se, hvem der kommer, og deres madvaner.'
        ] },
        { title: 'For moderatorer', items: [
          'Åbn "Administrér tjanser" nederst.',
          'Opret en tjans: navn, emoji, ugedage, antal personer pr. gang, påmindelse og evt. tilmelding.',
          'Lav plan: beboerne tages på skift fra i dag. Længden vælges, så alle får lige mange ture, eller du vælger selv antal uger.',
          'Skift person på en enkelt dag med rullemenuen ved dagen.',
          'CSV: eksportér planen til regneark eller importér en plan med kolonnerne dato;tjans;navn.'
        ] }
      ]
    },
    shared: {
      title: 'Fælles ting',
      intro: 'Ting på gangen, som andre gerne må bruge – kage, mad i køleskabet eller noget nyt til skuffen.',
      sections: [
        { title: 'Sådan bruges det', items: [
          'Tilføj en ting og vælg, om den er Fælles eller din egen.',
          'Den, der tilføjede tingen, og moderatorer kan fjerne den igen.'
        ] }
      ]
    },
    info: {
      title: 'Info',
      intro: 'Praktiske svar, fx "hvor har vi wc-rens?". Søg i feltet øverst.',
      sections: [
        { title: 'Gangen og kollegiet', items: [
          'Info for gangen kan alle på gangen skrive og rette.',
          'Info for hele kollegiet kan kun bestyrelsen og administrationen skrive og rette.'
        ] }
      ]
    },
    residents: {
      title: 'Beboere',
      intro: 'Hvem bor på gangen, invitationer, bestyrelse og venskabskollegier.',
      sections: [
        { title: 'Beboere', items: [
          'Tryk på et navn for at se personens profil: fødselsdag, telefon, madvaner og "om mig".',
          'Moderatorer kan gøre andre til moderator, fjerne titlen og fjerne beboere fra gangen.'
        ] },
        { title: 'Invitationer (moderatorer)', items: [
          'Vælg gang og tryk "Ny kode". Del koden eller linket – nye beboere kommer direkte ind på gangen.',
          'En kode gælder i 14 dage og op til 50 personer. Slet den, hvis den ikke skal bruges mere.',
          'Moderatorer kan også oprette nye gange på kollegiet.'
        ] },
        { title: 'Bestyrelse', items: [
          'Bestyrelsen vises for hele kollegiet.',
          'Bestyrelsesmedlemmer og administrationen kan tilføje og fjerne medlemmer.'
        ] },
        { title: 'Venskabskollegier', items: [
          'Bestyrelsen trykker "Find et venskabskollegie", søger på navn eller adresse og sender en anmodning. Bestyrelsen kan også acceptere eller afvise anmodninger.',
          'Bestyrelsen og administrationen kan rette kollegiets adresse under Adresse.',
          'Når I er venner, deler I fanen Venskab i Opslag og kan lave venskabsevents i kalenderen.'
        ] }
      ]
    },
    me: {
      title: 'Mig',
      intro: 'Dine egne oplysninger og indstillinger.',
      sections: [
        { title: 'Profil', items: [
          'Navn: vises for andre på kollegiet.',
          'Telefonnummer: frivilligt og kun synligt for din gang.',
          'Om mig: fødselsdag og en kort tekst er synlige for hele kollegiet. Allergier og madvaner kun for din gang.'
        ] },
        { title: 'Notifikationer', items: [
          'Slå dem til for at få besked om indkøb, dine tjanser og fødselsdage.',
          'På iPhone skal appen først lægges på hjemmeskærmen.',
          'Indstillingen gælder den enhed, du bruger lige nu.'
        ] },
        { title: 'Konto', items: [
          '"Forlad gangen" fjerner dig fra gangen. Du skal have en ny kode for at komme tilbage.',
          '"Slet min konto" sletter din konto og dine oplysninger permanent.'
        ] }
      ]
    },
    admin: {
      title: 'Admin',
      intro: 'For administrationen og superadmin.',
      sections: [
        { title: 'Administration af et kollegie', items: [
          'Meddelelse: slås op øverst i Opslag → Kollegiet for alle beboere.',
          'Rapporter: anonyme beskeder, der er rapporteret til administrationen. "Vis afsender" afslører afsenderen for dig, og det logges.',
          'Gange og beboere: lav invitationskoder, sæt eller fjern moderator og bestyrelse, fjern beboere og opret gange.'
        ] },
        { title: 'Superadmin', items: [
          'Godkend eller afvis nye kollegier.',
          'Tilknyt administration til et kollegie med personens e-mail. Personen skal have oprettet en konto først.'
        ] }
      ]
    }
  },
  roles: {
    resident: {
      title: 'Beboer',
      who: 'Alle, der bor på en gang.',
      can: ['Bruge indkøbsliste, kalender, opslag, brevkasse, tjanser, fælles ting og info.', 'Forlade gangen og slette sin konto.', 'Rapportere anonyme beskeder.'],
      how: 'Man bliver beboer ved at bruge en invitationskode fra en moderator eller administrationen.'
    },
    moderator: {
      title: 'Moderator',
      who: 'En beboer med ekstra rettigheder på sin gang. Der kan være flere.',
      can: ['Lave invitationskoder og oprette gange.', 'Gøre andre til moderator og fjerne titlen.', 'Fjerne beboere fra gangen.', 'Opsætte tjanser og planer.', 'Slette opslag og anonyme beskeder på gangen og behandle rapporter.', 'Redigere og slette events på gangen.'],
      how: 'En moderator gør en anden til moderator under Gangen → Beboere. Den første på en ny gang bliver automatisk moderator. Administrationen kan også give titlen.'
    },
    board: {
      title: 'Bestyrelse',
      who: 'Beboere, der sidder i kollegiets bestyrelse. Der kan være flere.',
      can: ['Lave meddelelser til hele kollegiet.', 'Skrive info for hele kollegiet.', 'Tilføje og fjerne bestyrelsesmedlemmer.', 'Sende og acceptere venskabsanmodninger.', 'Redigere og slette events og opslag på kollegiet.'],
      how: 'Et bestyrelsesmedlem tilføjer andre under Gangen → Beboere → Bestyrelse. Administrationen kan også gøre det under Admin.'
    },
    admin: {
      title: 'Administration',
      who: 'Fagpersoner, fx vicevært eller boligadministration. Kan være tilknyttet ét eller flere kollegier og behøver ikke bo der.',
      can: ['Lave meddelelser til beboerne.', 'Tilføje og fjerne beboere, oprette gange og lave invitationskoder.', 'Give og fjerne moderator- og bestyrelsestitler.', 'Behandle rapporter og se afsenderen af rapporterede anonyme beskeder.'],
      how: 'Superadmin tilknytter administration under Admin → Kollegier og administration.'
    },
    superadmin: {
      title: 'Superadmin',
      who: 'Den, der driver KollegieAppen.',
      can: ['Godkende nye kollegier.', 'Tilknytte og fjerne administration.'],
      how: 'Sættes direkte i databasen.'
    }
  },
  faq: [
    { q: 'Hvordan laver jeg et bestyrelsesmedlem?', a: 'Er du i bestyrelsen: Gangen → Beboere → Bestyrelse, vælg beboeren og tryk Tilføj. Er du administration: Admin → sæt flueben i "Bestyrelse" ved personen. Har kollegiet hverken bestyrelse eller administration endnu, skal superadmin tilknytte en administration, som så kan udpege den første bestyrelse.' },
    { q: 'Hvordan gør jeg en anden til moderator?', a: 'Som moderator: Gangen → Beboere, tryk "Gør til moderator" ved personen. Administrationen kan gøre det under Admin.' },
    { q: 'Hvordan inviterer jeg en ny beboer?', a: 'Som moderator: Gangen → Beboere → Invitationskoder. Vælg gangen, tryk "Ny kode" og "Del". Den nye beboer åbner linket, opretter en konto og kommer direkte ind på gangen.' },
    { q: 'Jeg har fået et link, men kommer ikke ind på gangen', a: 'Koden kan være udløbet (14 dage) eller brugt op. Bed en moderator om en ny kode. Du kan også skrive koden manuelt på velkomstsiden.' },
    { q: 'Hvordan installerer jeg appen?', a: 'iPhone: åbn siden i Safari, tryk Del og vælg "Føj til hjemmeskærm". Android: åbn menuen i Chrome og vælg "Installer app". På iPhone skal du logge ind igen første gang, du åbner appen fra hjemmeskærmen.' },
    { q: 'Hvorfor får jeg ingen notifikationer?', a: 'Slå dem til under Mig → Notifikationer på hver enhed. På iPhone virker det kun, når appen er åbnet fra hjemmeskærmen. Tjek også, at notifikationer er tilladt for appen i telefonens indstillinger.' },
    { q: 'Hvem kan se mit telefonnummer og mine allergier?', a: 'Kun beboere på din egen gang. Fødselsdag og "om mig" kan ses af hele kollegiet.' },
    { q: 'Er brevkassen virkelig anonym?', a: 'Ja for beboere og moderatorer. Afsenderen gemmes skjult, og kun administrationen kan se den, hvis beskeden er rapporteret til administrationen. Hver gang det sker, bliver det logget.' },
    { q: 'Hvordan laver jeg en rengøringsplan eller en plan for fællesspisning?', a: 'Som moderator: Gangen → Tjanser → Administrér tjanser. Opret en tjans (fx 🍝 Fællesspisning med 2 personer og tilmelding), og tryk "Lav plan".' },
    { q: 'Hvordan bytter jeg tjans med en anden?', a: 'Aftal det med den anden og bed en moderator om at skifte navnet på dagen i planen.' },
    { q: 'Hvordan tilmelder jeg mig fællesspisning?', a: 'Gangen → Tjanser. Tryk "Jeg er med" ved dagen. Tryk igen for at melde fra.' },
    { q: 'Hvordan laver jeg en afstemning?', a: 'Opslag → skriv dit opslag → "📊 Tilføj afstemning" → skriv svarmulighederne → Slå op.' },
    { q: 'Hvordan bliver vi venner med et andet kollegie?', a: 'Bestyrelsen sender en anmodning under Gangen → Beboere → Venskabskollegier. Det andet kollegies bestyrelse skal acceptere.' },
    { q: 'Hvordan redigerer jeg et event?', a: 'Tryk på blyanten ved eventet. Det kan den, der oprettede det, samt moderatorer, bestyrelsen, administrationen og superadmin.' },
    { q: 'Hvordan skifter jeg sprog?', a: 'Mig → Sprog → Dansk eller English.' },
    { q: 'Hvordan flytter jeg til en anden gang?', a: 'Forlad din nuværende gang under Mig, og brug en invitationskode til den nye gang.' }
  ],
  tips: {
    notify: 'Sender en notifikation med alt, der mangler, til alle på gangen, som har slået notifikationer til.',
    calView: 'Skift mellem liste og månedsvisning. I måneden viser prikken antal events, og 🎂 fødselsdage.',
    reactions: '❤️ og ❌ viser, hvad folk synes, fx om de kommer. Du kan vælge én og skifte når som helst.',
    eventScope: 'Gang: kun din gang. Kollegie: alle beboere på kollegiet. Venskab: også jeres venskabskollegier.',
    postKind: 'Fremleje kan vises for sig eller skjules over listen. Meddelelser vises øverst og kan kun laves af bestyrelsen og administrationen.',
    poll: 'Hver person har én stemme og kan skifte den. Procenter vises efter man har stemt.',
    dutyPeople: 'Hvor mange der har tjansen samme dag, fx 2 kokke. Den samme person får aldrig to pladser samme dag.',
    dutySignup: 'Giver en "Jeg er med"-knap ved hver dag – fx til fællesspisning, så kokkene ved, hvor mange der kommer.',
    dutyRounds: 'Valgene sørger for, at alle beboere får lige mange ture. Vælg selv antal uger nederst i listen.',
    csv: 'Brug semikolon og kolonnerne dato;tjans;navn. Navne skal matche beboernes navne i appen.',
    sharedOwner: 'Fælles: alle må bruge den. Mig: den er din, men andre må gerne låne.',
    infoScope: 'Gangen: alle på gangen kan skrive. Kollegiet: kun bestyrelsen og administrationen.',
    invites: 'En kode gælder i 14 dage og op til 50 personer. Den, der bruger den, kommer direkte ind på den valgte gang.',
    moderator: 'Moderatorer kan invitere, fjerne beboere, opsætte tjanser og slette opslag på gangen.',
    board: 'Bestyrelsen kan lave meddelelser, skrive info for kollegiet og styre venskabskollegier.',
    friends: 'Venskabskollegier deler fanen Venskab i Opslag og kan lave events for hinanden.',
    phone: 'Kun beboere på din gang kan se dit nummer.',
    reveal: 'Afslører afsenderen af en rapporteret anonym besked for dig. Hver afsløring logges.'
  }
}

const en: HelpContent = {
  pages: {
    shopping: {
      title: 'Shopping',
      intro: "The hall's shared shopping and to-do list. Everyone on the hall sees the same list, and it updates instantly.",
      sections: [
        { title: 'Using the list', items: [
          'Type what is missing in the field at the top and tap Add.',
          'Tap an item when it has been bought. It moves down under "Bought".',
          'Tap a bought item again if it is needed after all.',
          '"Remove bought" clears all bought items.'
        ] },
        { title: 'Notify the hall', items: [
          '"Notify the hall" sends a notification to everyone on the hall with what is missing.',
          "Only people who have turned on notifications get it. You don't get it yourself."
        ] }
      ]
    },
    calendar: {
      title: 'Calendar',
      intro: 'Events for the hall, the whole dorm and your friend dorms, plus residents’ birthdays.',
      sections: [
        { title: 'Views and filters', items: [
          'Switch between list ☰ and month ▦ at the top right.',
          'In month view the dot shows the number of events and 🎂 shows birthdays. Tap a day to see it.',
          'Filter by All, Hall, Dorm or Friends.'
        ] },
        { title: 'Create and edit', items: [
          'Tap "+ New event" and choose who it is for: your hall, the whole dorm or your friend dorms.',
          'The creator can edit and delete the event. So can moderators, the board, the administration and the superadmin.',
          'An event cannot be moved to another group afterwards. Delete it and create a new one.'
        ] },
        { title: 'Reactions and comments', items: [
          '❤️ and ❌ show what people think, e.g. whether they are coming. Pick one and change it any time.',
          '💬 opens the comments. Everyone who can see the event can write.'
        ] }
      ]
    },
    board: {
      title: 'Board',
      intro: 'Boards for the hall, the whole dorm and friend dorms, plus the anonymous mailbox.',
      sections: [
        { title: 'The tabs', items: [
          'Hall: only for residents of your hall.',
          'Mailbox: anonymous messages to the hall.',
          'Dorm ("town square"): for all residents of the dorm. Announcements from the board and administration are pinned at the top.',
          'Friends: shared with your friend dorms.'
        ] },
        { title: 'Search and filter', items: [
          'Search the text of posts with the field above the list.',
          'Tap "Filter" to choose a time period: today, last 7 or 30 days, a specific date or from–to.',
          'Under Dorm you can filter by hall, and under Friends by dorm.'
        ] },
        { title: 'Kinds of posts', items: [
          'Under Dorm and Friends you can choose Post or Sublet. Choose "Only sublets" or "No sublets" above the list.',
          'The board and administration can also make an Announcement, shown at the top with 📣.'
        ] },
        { title: 'Polls', items: [
          'Tap "📊 Add poll" before posting and write 2–8 options.',
          'Everyone has one vote and can change it. Percentages show once you have voted.'
        ] },
        { title: 'Edit and delete', items: [
          'You can edit your own posts. "edited" is shown next to the time.',
          'Moderators can delete posts on the hall. The board and administration can delete posts on the dorm.'
        ] }
      ]
    },
    mailbox: {
      title: 'Anonymous mailbox',
      intro: 'Write to the hall without showing your name – e.g. when something is hard to bring up directly.',
      sections: [
        { title: 'Anonymity', items: [
          'No residents or moderators can see who wrote a message.',
          'The sender is stored hidden. Only the administration can see it, and only if the message was reported to the administration. Every reveal is logged.'
        ] },
        { title: 'Report abuse', items: [
          'Tap "Report" on a message and choose whether the report goes to the moderators or the administration.',
          'Moderators see reports at the top of the mailbox and can delete the message or mark the report resolved.'
        ] }
      ]
    },
    duties: {
      title: 'Duties',
      intro: 'Recurring tasks in turns: cleaning, shared dinner, trash and the like.',
      sections: [
        { title: 'For everyone', items: [
          'Your next turn is shown at the top, with the plan for the whole hall below.',
          'You get a reminder the same day or the day before if notifications are on.',
          'If the duty has sign-up (e.g. shared dinner), tap "I\'m in". Expand the list to see who is coming and their diets.'
        ] },
        { title: 'For moderators', items: [
          'Open "Manage duties" at the bottom.',
          'Create a duty: name, emoji, weekdays, people per turn, reminder and optional sign-up.',
          'Make plan: residents take turns from today. The length is chosen so everyone gets the same number of turns, or choose your own number of weeks.',
          'Change the person on a single day with the dropdown next to it.',
          'CSV: export the plan to a spreadsheet or import a plan with the columns date;duty;name.'
        ] }
      ]
    },
    shared: {
      title: 'Shared things',
      intro: 'Things on the hall others may use – cake, food in the fridge or something new for the drawer.',
      sections: [
        { title: 'How to use it', items: [
          'Add a thing and choose whether it is Shared or yours.',
          'The person who added it and moderators can remove it.'
        ] }
      ]
    },
    info: {
      title: 'Info',
      intro: 'Practical answers, e.g. "where is the toilet cleaner?". Search at the top.',
      sections: [
        { title: 'Hall and dorm', items: [
          'Everyone on the hall can write and edit hall info.',
          'Only the board and administration can write and edit info for the whole dorm.'
        ] }
      ]
    },
    residents: {
      title: 'Residents',
      intro: 'Who lives on the hall, invites, the board and friend dorms.',
      sections: [
        { title: 'Residents', items: [
          'Tap a name to see the person’s profile: birthday, phone, diet and "about me".',
          'Moderators can make others moderator, remove the title and remove residents from the hall.'
        ] },
        { title: 'Invites (moderators)', items: [
          'Choose a hall and tap "New code". Share the code or link – new residents go straight to the hall.',
          'A code is valid for 14 days and up to 50 people. Delete it when it is no longer needed.',
          'Moderators can also create new halls in the dorm.'
        ] },
        { title: 'Board', items: [
          'The board is shown for the whole dorm.',
          'Board members and the administration can add and remove members.'
        ] },
        { title: 'Friend dorms', items: [
          'The board taps "Find a friend dorm", searches by name or address and sends a request. The board can also accept or reject requests.',
          'The board and administration can edit the dorm address under Address.',
          'Once friends, you share the Friends tab in Board and can create friend events in the calendar.'
        ] }
      ]
    },
    me: {
      title: 'Me',
      intro: 'Your own details and settings.',
      sections: [
        { title: 'Profile', items: [
          'Name: shown to others in the dorm.',
          'Phone number: optional and only visible to your hall.',
          'About me: birthday and a short text are visible to the whole dorm. Allergies and diet only to your hall.'
        ] },
        { title: 'Notifications', items: [
          'Turn them on to hear about shopping, your duties and birthdays.',
          'On iPhone the app must be added to the home screen first.',
          'The setting applies to the device you are using now.'
        ] },
        { title: 'Account', items: [
          '"Leave the hall" removes you from the hall. You need a new code to come back.',
          '"Delete my account" permanently deletes your account and data.'
        ] }
      ]
    },
    admin: {
      title: 'Admin',
      intro: 'For the administration and the superadmin.',
      sections: [
        { title: 'Administering a dorm', items: [
          'Announcement: pinned at the top of Board → Dorm for all residents.',
          'Reports: anonymous messages reported to the administration. "Show sender" reveals the sender to you, and it is logged.',
          'Halls and residents: create invite codes, set or remove moderator and board, remove residents and create halls.'
        ] },
        { title: 'Superadmin', items: [
          'Approve or reject new dorms.',
          'Assign administration to a dorm by email. The person must have created an account first.'
        ] }
      ]
    }
  },
  roles: {
    resident: {
      title: 'Resident',
      who: 'Everyone who lives on a hall.',
      can: ['Use shopping, calendar, board, mailbox, duties, shared things and info.', 'Leave the hall and delete their account.', 'Report anonymous messages.'],
      how: 'You become a resident by using an invite code from a moderator or the administration.'
    },
    moderator: {
      title: 'Moderator',
      who: 'A resident with extra rights on their hall. There can be several.',
      can: ['Create invite codes and halls.', 'Make others moderator and remove the title.', 'Remove residents from the hall.', 'Set up duties and plans.', 'Delete posts and anonymous messages on the hall and handle reports.', 'Edit and delete events on the hall.'],
      how: 'A moderator makes someone else moderator under Hall → Residents. The first person on a new hall automatically becomes moderator. The administration can also grant it.'
    },
    board: {
      title: 'Board',
      who: 'Residents on the dorm board. There can be several.',
      can: ['Post announcements to the whole dorm.', 'Write info for the whole dorm.', 'Add and remove board members.', 'Send and accept friend requests.', 'Edit and delete events and posts on the dorm.'],
      how: 'A board member adds others under Hall → Residents → Board. The administration can also do it under Admin.'
    },
    admin: {
      title: 'Administration',
      who: 'Professionals such as caretakers or housing administration. Can be assigned to one or more dorms without living there.',
      can: ['Post announcements to residents.', 'Add and remove residents, create halls and invite codes.', 'Grant and remove moderator and board titles.', 'Handle reports and see the sender of reported anonymous messages.'],
      how: 'The superadmin assigns administration under Admin → Dorms and administration.'
    },
    superadmin: {
      title: 'Superadmin',
      who: 'Whoever runs KollegieAppen.',
      can: ['Approve new dorms.', 'Assign and remove administration.'],
      how: 'Set directly in the database.'
    }
  },
  faq: [
    { q: 'How do I make someone a board member?', a: 'If you are on the board: Hall → Residents → Board, choose the resident and tap Add. If you are administration: Admin → tick "Board" next to the person. If the dorm has neither a board nor administration yet, the superadmin must assign an administration, who can then appoint the first board.' },
    { q: 'How do I make someone moderator?', a: 'As moderator: Hall → Residents, tap "Make moderator" next to the person. The administration can do it under Admin.' },
    { q: 'How do I invite a new resident?', a: 'As moderator: Hall → Residents → Invite codes. Choose the hall, tap "New code" and "Share". The new resident opens the link, creates an account and goes straight to the hall.' },
    { q: "I got a link but can't get into the hall", a: 'The code may have expired (14 days) or been used up. Ask a moderator for a new one. You can also type the code on the welcome page.' },
    { q: 'How do I install the app?', a: 'iPhone: open the page in Safari, tap Share and choose "Add to Home Screen". Android: open the Chrome menu and choose "Install app". On iPhone you need to log in again the first time you open it from the home screen.' },
    { q: "Why don't I get notifications?", a: 'Turn them on under Me → Notifications on each device. On iPhone it only works when the app is opened from the home screen. Also check that notifications are allowed for the app in your phone settings.' },
    { q: 'Who can see my phone number and allergies?', a: 'Only residents on your own hall. Birthday and "about me" are visible to the whole dorm.' },
    { q: 'Is the mailbox really anonymous?', a: 'Yes, for residents and moderators. The sender is stored hidden, and only the administration can see it if the message was reported to them. Every reveal is logged.' },
    { q: 'How do I make a cleaning or shared dinner plan?', a: 'As moderator: Hall → Duties → Manage duties. Create a duty (e.g. 🍝 Shared dinner with 2 people and sign-up) and tap "Make plan".' },
    { q: 'How do I swap a duty with someone?', a: 'Agree with them and ask a moderator to change the name on that day in the plan.' },
    { q: 'How do I sign up for shared dinner?', a: 'Hall → Duties. Tap "I\'m in" next to the day. Tap again to cancel.' },
    { q: 'How do I create a poll?', a: 'Board → write your post → "📊 Add poll" → write the options → Post.' },
    { q: 'How do we become friends with another dorm?', a: 'The board sends a request under Hall → Residents → Friend dorms. The other dorm’s board must accept.' },
    { q: 'How do I edit an event?', a: 'Tap the pencil next to the event. The creator can, as can moderators, the board, the administration and the superadmin.' },
    { q: 'How do I change language?', a: 'Me → Language → Dansk or English.' },
    { q: 'How do I move to another hall?', a: 'Leave your current hall under Me, and use an invite code for the new hall.' }
  ],
  tips: {
    notify: 'Sends a notification with everything missing to everyone on the hall who has notifications on.',
    calView: 'Switch between list and month view. In month view the dot shows events and 🎂 birthdays.',
    reactions: '❤️ and ❌ show what people think, e.g. whether they are coming. Pick one and change it any time.',
    eventScope: 'Hall: only your hall. Dorm: all residents of the dorm. Friends: your friend dorms too.',
    postKind: 'Sublets can be shown on their own or hidden above the list. Announcements are pinned at the top and can only be made by the board and administration.',
    poll: 'Everyone has one vote and can change it. Percentages show after voting.',
    dutyPeople: 'How many have the duty on the same day, e.g. 2 cooks. The same person never gets two places on one day.',
    dutySignup: 'Adds an "I\'m in" button for each day – e.g. for shared dinner, so the cooks know how many are coming.',
    dutyRounds: 'The options make sure every resident gets the same number of turns. Choose your own number of weeks at the bottom of the list.',
    csv: 'Use semicolons and the columns date;duty;name. Names must match the residents’ names in the app.',
    sharedOwner: 'Shared: anyone may use it. Me: it is yours, but others may borrow it.',
    infoScope: 'Hall: everyone on the hall can write. Dorm: only the board and administration.',
    invites: 'A code is valid for 14 days and up to 50 people. Whoever uses it goes straight to the chosen hall.',
    moderator: 'Moderators can invite, remove residents, set up duties and delete posts on the hall.',
    board: 'The board can post announcements, write dorm info and manage friend dorms.',
    friends: 'Friend dorms share the Friends tab in Board and can create events for each other.',
    phone: 'Only residents on your hall can see your number.',
    reveal: 'Reveals the sender of a reported anonymous message to you. Every reveal is logged.'
  }
}

export const help: Record<Lang, HelpContent> = { da, en }
