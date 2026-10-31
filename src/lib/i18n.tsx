import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type Lang = 'da' | 'en'

const da = {
  'app.name': 'KollegieAppen',
  'common.save': 'Gem',
  'common.cancel': 'Annullér',
  'common.delete': 'Slet',
  'common.add': 'Tilføj',
  'common.loading': 'Henter…',
  'common.copy': 'Kopiér',
  'common.copied': 'Kopieret',
  'common.share': 'Del',
  'common.hall': 'Gang',
  'common.dorm': 'Kollegie',
  'common.all': 'Alle',
  'common.you': 'dig',
  'common.confirm': 'Er du sikker?',

  'nav.shopping': 'Indkøb',
  'nav.calendar': 'Kalender',
  'nav.board': 'Opslag',
  'nav.hall': 'Gangen',
  'nav.me': 'Mig',
  'nav.admin': 'Admin',

  'auth.login': 'Log ind',
  'auth.signup': 'Opret konto',
  'auth.email': 'E-mail',
  'auth.password': 'Adgangskode',
  'auth.name': 'Navn',
  'auth.forgot': 'Glemt adgangskode?',
  'auth.resetSent': 'Vi har sendt et link til at nulstille din adgangskode. Tjek din mail.',
  'auth.checkMail': 'Næsten færdig! Tjek din mail og klik på linket for at bekræfte din konto. Log derefter ind her.',
  'auth.newPassword': 'Vælg ny adgangskode',
  'auth.passwordUpdated': 'Din adgangskode er opdateret.',
  'auth.tagline': 'Indkøb, kalender og opslag for din gang og dit kollegie.',
  'auth.haveAccount': 'Har du allerede en konto?',
  'auth.noAccount': 'Ny her?',

  'onb.title': 'Velkommen',
  'onb.intro': 'Du er ikke med på en gang endnu. Brug en invitationskode fra din gang, eller registrér dit kollegie.',
  'onb.code': 'Invitationskode',
  'onb.join': 'Bliv en del af gangen',
  'onb.or': 'eller',
  'onb.request': 'Registrér et nyt kollegie',
  'onb.dormName': 'Kollegiets navn',
  'onb.address': 'Adresse (valgfri)',
  'onb.halls': 'Gange (én pr. linje)',
  'onb.hallsHint': 'Fx "1. sal", "Køkken A" eller "Gang 3". Flere kan tilføjes senere.',
  'onb.myHall': 'Hvilken gang bor du på?',
  'onb.send': 'Send anmodning',
  'onb.requestNote': 'Du bliver moderator på din gang. Kollegiet skal godkendes, før det kan bruges.',

  'pending.title': 'Afventer godkendelse',
  'pending.body': 'Anmodningen om {dorm} er sendt. Du kan bruge appen, så snart kollegiet er godkendt.',
  'pending.refresh': 'Tjek igen',
  'pending.cancel': 'Træk anmodningen tilbage',

  'shop.title': 'Indkøbsliste',
  'shop.placeholder': 'Hvad mangler vi?',
  'shop.empty': 'Listen er tom. Godt gået!',
  'shop.clearDone': 'Fjern købte ({n})',
  'shop.bought': 'Købt',

  'cal.title': 'Kalender',
  'cal.new': 'Nyt event',
  'cal.what': 'Titel',
  'cal.date': 'Dato',
  'cal.start': 'Start',
  'cal.end': 'Slut (valgfri)',
  'cal.where': 'Sted (valgfri)',
  'cal.desc': 'Beskrivelse (valgfri)',
  'cal.for': 'Hvem er det for?',
  'cal.empty': 'Ingen kommende events.',
  'cal.today': 'I dag',
  'cal.tomorrow': 'I morgen',

  'board.title': 'Opslag',
  'board.hall': 'Gangen',
  'board.square': 'Town square',
  'board.placeholder': 'Skriv et opslag…',
  'board.post': 'Slå op',
  'board.emptyHall': 'Ingen opslag på gangen endnu.',
  'board.emptySquare': 'Ingen opslag for hele kollegiet endnu.',
  'board.squareHint': 'Synligt for alle beboere på {dorm}.',

  'hall.members': 'Beboere',
  'hall.moderator': 'Moderator',
  'hall.makeMod': 'Gør til moderator',
  'hall.removeMod': 'Fjern moderator',
  'hall.kick': 'Fjern fra gangen',
  'hall.kickConfirm': 'Fjern {name} fra gangen?',
  'hall.invites': 'Invitationskoder',
  'hall.newInvite': 'Ny kode',
  'hall.inviteFor': 'Kode til',
  'hall.inviteInfo': 'Brugt {uses}/{max} · udløber {date}',
  'hall.inviteShare': 'Kom med på {hall} i KollegieAppen: {link}',
  'hall.otherHalls': 'Gange på kollegiet',
  'hall.newHall': 'Ny gang',
  'hall.newHallName': 'Navn på gangen',
  'hall.noInvites': 'Ingen aktive koder.',

  'me.title': 'Mig',
  'me.name': 'Navn',
  'me.language': 'Sprog',
  'me.install': 'Læg appen på hjemmeskærmen',
  'me.installIos': 'iPhone: åbn siden i Safari, tryk på Del-knappen og vælg "Føj til hjemmeskærm".',
  'me.installAndroid': 'Android: åbn menuen i Chrome og vælg "Installer app".',
  'me.leave': 'Forlad gangen',
  'me.leaveConfirm': 'Vil du forlade {hall}? Du skal bruge en ny invitationskode for at komme tilbage.',
  'me.logout': 'Log ud',
  'me.delete': 'Slet min konto',
  'me.deleteConfirm': 'Din konto og dine data slettes permanent. Vil du fortsætte?',
  'me.saved': 'Gemt',

  'admin.title': 'Kollegier til godkendelse',
  'admin.empty': 'Ingen anmodninger lige nu.',
  'admin.approve': 'Godkend',
  'admin.reject': 'Afvis',
  'admin.by': 'Anmodet af {name} ({email})',

  'err.already_member': 'Du er allerede med på en gang.',
  'err.invalid_code': 'Koden er ugyldig eller udløbet.',
  'err.forbidden': 'Det har du ikke rettigheder til.',
  'err.last_moderator': 'Gangen skal have mindst én moderator.',
  'err.my_hall_not_in_list': 'Din gang skal stå på listen over gange.',
  'err.invalid_halls': 'Skriv mindst én gang.',
  'err.Invalid login credentials': 'Forkert e-mail eller adgangskode.',
  'err.User already registered': 'Der findes allerede en konto med den e-mail.',
  'err.Email not confirmed': 'Bekræft din e-mail først. Tjek din indbakke.',
  'err.duplicate': 'Det navn findes allerede.'
}

type Key = keyof typeof da

const en: Record<Key, string> = {
  'app.name': 'KollegieAppen',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.add': 'Add',
  'common.loading': 'Loading…',
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.share': 'Share',
  'common.hall': 'Hall',
  'common.dorm': 'Dorm',
  'common.all': 'All',
  'common.you': 'you',
  'common.confirm': 'Are you sure?',

  'nav.shopping': 'Shopping',
  'nav.calendar': 'Calendar',
  'nav.board': 'Board',
  'nav.hall': 'Hall',
  'nav.me': 'Me',
  'nav.admin': 'Admin',

  'auth.login': 'Log in',
  'auth.signup': 'Create account',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.name': 'Name',
  'auth.forgot': 'Forgot password?',
  'auth.resetSent': 'We sent you a link to reset your password. Check your email.',
  'auth.checkMail': 'Almost there! Check your email and click the link to confirm your account. Then log in here.',
  'auth.newPassword': 'Choose a new password',
  'auth.passwordUpdated': 'Your password has been updated.',
  'auth.tagline': 'Shopping, calendar and posts for your hall and your dorm.',
  'auth.haveAccount': 'Already have an account?',
  'auth.noAccount': 'New here?',

  'onb.title': 'Welcome',
  'onb.intro': "You're not on a hall yet. Use an invite code from your hall, or register your dorm.",
  'onb.code': 'Invite code',
  'onb.join': 'Join the hall',
  'onb.or': 'or',
  'onb.request': 'Register a new dorm',
  'onb.dormName': 'Dorm name',
  'onb.address': 'Address (optional)',
  'onb.halls': 'Halls (one per line)',
  'onb.hallsHint': 'E.g. "1st floor", "Kitchen A" or "Hall 3". You can add more later.',
  'onb.myHall': 'Which hall do you live on?',
  'onb.send': 'Send request',
  'onb.requestNote': 'You become moderator of your hall. The dorm must be approved before it can be used.',

  'pending.title': 'Awaiting approval',
  'pending.body': 'The request for {dorm} has been sent. You can use the app as soon as the dorm is approved.',
  'pending.refresh': 'Check again',
  'pending.cancel': 'Withdraw request',

  'shop.title': 'Shopping list',
  'shop.placeholder': 'What do we need?',
  'shop.empty': 'The list is empty. Nice!',
  'shop.clearDone': 'Remove bought ({n})',
  'shop.bought': 'Bought',

  'cal.title': 'Calendar',
  'cal.new': 'New event',
  'cal.what': 'Title',
  'cal.date': 'Date',
  'cal.start': 'Start',
  'cal.end': 'End (optional)',
  'cal.where': 'Location (optional)',
  'cal.desc': 'Description (optional)',
  'cal.for': 'Who is it for?',
  'cal.empty': 'No upcoming events.',
  'cal.today': 'Today',
  'cal.tomorrow': 'Tomorrow',

  'board.title': 'Board',
  'board.hall': 'Hall',
  'board.square': 'Town square',
  'board.placeholder': 'Write a post…',
  'board.post': 'Post',
  'board.emptyHall': 'No posts on the hall yet.',
  'board.emptySquare': 'No posts for the whole dorm yet.',
  'board.squareHint': 'Visible to all residents of {dorm}.',

  'hall.members': 'Residents',
  'hall.moderator': 'Moderator',
  'hall.makeMod': 'Make moderator',
  'hall.removeMod': 'Remove moderator',
  'hall.kick': 'Remove from hall',
  'hall.kickConfirm': 'Remove {name} from the hall?',
  'hall.invites': 'Invite codes',
  'hall.newInvite': 'New code',
  'hall.inviteFor': 'Code for',
  'hall.inviteInfo': 'Used {uses}/{max} · expires {date}',
  'hall.inviteShare': 'Join {hall} on KollegieAppen: {link}',
  'hall.otherHalls': 'Halls in the dorm',
  'hall.newHall': 'New hall',
  'hall.newHallName': 'Hall name',
  'hall.noInvites': 'No active codes.',

  'me.title': 'Me',
  'me.name': 'Name',
  'me.language': 'Language',
  'me.install': 'Add the app to your home screen',
  'me.installIos': 'iPhone: open the page in Safari, tap the Share button and choose "Add to Home Screen".',
  'me.installAndroid': 'Android: open the Chrome menu and choose "Install app".',
  'me.leave': 'Leave the hall',
  'me.leaveConfirm': 'Leave {hall}? You will need a new invite code to come back.',
  'me.logout': 'Log out',
  'me.delete': 'Delete my account',
  'me.deleteConfirm': 'Your account and data will be permanently deleted. Continue?',
  'me.saved': 'Saved',

  'admin.title': 'Dorms awaiting approval',
  'admin.empty': 'No requests right now.',
  'admin.approve': 'Approve',
  'admin.reject': 'Reject',
  'admin.by': 'Requested by {name} ({email})',

  'err.already_member': 'You are already on a hall.',
  'err.invalid_code': 'The code is invalid or expired.',
  'err.forbidden': "You don't have permission to do that.",
  'err.last_moderator': 'The hall must have at least one moderator.',
  'err.my_hall_not_in_list': 'Your hall must be in the list of halls.',
  'err.invalid_halls': 'Enter at least one hall.',
  'err.Invalid login credentials': 'Wrong email or password.',
  'err.User already registered': 'An account with that email already exists.',
  'err.Email not confirmed': 'Confirm your email first. Check your inbox.',
  'err.duplicate': 'That name already exists.'
}

const dicts: Record<Lang, Record<string, string>> = { da, en }

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('ka.lang')
    if (saved === 'da' || saved === 'en') return saved
  } catch { /* ignore */ }
  return navigator.language?.startsWith('da') ? 'da' : 'en'
}

type Ctx = {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  locale: string
}

const I18nContext = createContext<Ctx>(null as unknown as Ctx)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    document.documentElement.lang = l
    try { localStorage.setItem('ka.lang', l) } catch { /* ignore */ }
  }, [])
  const value = useMemo<Ctx>(() => {
    const t = (key: string, vars?: Record<string, string | number>) => {
      let s = dicts[lang][key] ?? dicts.da[key] ?? key
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
      return s
    }
    return { lang, setLang, t, locale: lang === 'da' ? 'da-DK' : 'en-GB' }
  }, [lang, setLang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = () => useContext(I18nContext)
