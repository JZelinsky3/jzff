"""
NFL.com Fantasy Football League Scraper — Configuration
"""

# ---- Your league ----
LEAGUE_ID = "7528632"

# ---- Seasons to scrape ----
SEASONS = [2019, 2020, 2021, 2022, 2023, 2024, 2025]

WEEKS = list(range(1, 18))

# ---- Your team ----
YOUR_TEAM_ID = 1
YOUR_USER_ID = 21679440  # stable across all seasons regardless of team_id

# ---- Authentication ----
COOKIE_STRING = "nflcs.prod.crossDomainStorageCleared=true; s_ecid=MCMID%7C29385512181906628980512281067241572147; adobeujs-optin=%7B%22aam%22%3Atrue%2C%22adcloud%22%3Afalse%2C%22aa%22%3Atrue%2C%22campaign%22%3Afalse%2C%22ecid%22%3Atrue%2C%22livefyre%22%3Afalse%2C%22target%22%3Atrue%2C%22mediaaa%22%3Atrue%7D; gig_bootstrap_3_Qa8TkWpIB8ESCBT8tY2TukbVKgO5F6BJVc7N1oComdwFzI7H2L9NOWdm11i_BY9f=auth-id_ver4; _scor_uid=48506d031050471cb3acbe29abbbd3b0; _gcl_au=1.1.907171126.1775868000; at_check=true; AMCVS_F75C3025512D2C1D0A490D44%40AdobeOrg=1; AMCV_F75C3025512D2C1D0A490D44%40AdobeOrg=179643557%7CMCIDTS%7C20585%7CMCMID%7C29385512181906628980512281067241572147%7CMCAAMLH-1779064167%7C7%7CMCAAMB-1779064167%7CRKhpRz8krg2tLO6pguXWp5olkAcUniQYPHaMWWgdJ3xzPWQmdj0y%7CMCOPTOUT-1778466567s%7CNONE%7CMCAID%7CNONE%7CvVersion%7C5.5.0; s_cc=true; cto_bundle=gogPdl9ra2VCdDhxY2FzalglMkZWSVd5NU5JNDIlMkYzU1Z3b1A2SG1EVlVVSFl5WnNjJTJCNkR4N3FLdENrUUw5c0xoSElTdmJZOG9UTnVUdVhzcnlUZHdzcktZb0xHYWFobW4zUEVrS3l3dzJCVlJjNnhEYVFSV1oyWnp5WThUUm5PQ1V2eUg5clhjSWtHMVNyQmJOT0NwbDFpSXZGaWclM0QlM0Q; OTGPPConsent=DBABLA~BVQVAAAABgA.QA; gig_bootstrap_3_WPLZFkJ278FjSau2FfLCrTRUyksAjeYpcva-qIfGl71F4VWrI-7Xb5y0snqKXDva=auth-id_ver4; OTGPPConsent=DBABLA~BVQqAAAAAAKA.QA; gig_bootstrap_3_3g_DApOD0TCeN6ZJpzQMr7H1cIbtqtHwDjKVESN3N5oohMleIozT0I9WecPZeytT=auth-id_ver4; kndctr_F75C3025512D2C1D0A490D44_AdobeOrg_identity=CiYyOTM4NTUxMjE4MTkwNjYyODk4MDUxMjI4MTA2NzI0MTU3MjE0N1IQCKLe7M%5FXMxgBKgNWQTYwA%5FABheTBo%2DEz; kndctr_F75C3025512D2C1D0A490D44_AdobeOrg_cluster=va6; _gid=GA1.2.1970443244.1778459376; OptanonAlertBoxClosed=2026-05-11T00:29:36.845Z; OptanonConsent=isGpcEnabled=0&datestamp=Sun+May+10+2026+20%3A29%3A49+GMT-0400+(Eastern+Daylight+Time)&version=202604.1.0&browserGpcFlag=0&isIABGlobal=false&hosts=&consentId=9a61311e-0c53-48df-9187-f67a1fe909bd&interactionCount=2&isAnonUser=1&landingPath=NotLandingPage&GPPCookiesCount=1&gppSid=7&groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1%2CBG462%3A1%2CC0004%3A1&crTime=1778459377310&AwaitingReconsent=false&isDntEnabled=0&prevHadToken=0&intType=3&geolocation=US%3BNY; nfl_web_sdk_plugin_storage={%22s_ppv%22:{%22noScrollClick%22:1%2C%22scrollDelta%22:0%2C%22footerSeen%22:false%2C%22lastRecPage%22:%22id.nfl.com:account:account:sign%20in%20biometric%22%2C%22percentPageViewed%22:100%2C%22initialPageViewed%22:100%2C%22maxPageViewed%22:930}}; _ga_M6JHFFXV8K=GS2.1.s1778459375$o1$g1$t1778459390$j45$l0$h0; _ga=GA1.1.1959248135.1778459376; 249085b50c4844b=VoGXS3VyVD_7R0feLP7PHWWr6fw.*AAJTSQACMDIAAlNLABxMQWdsRk5OU2gyREVsL1l3UWZacElmV3cyWTg9AAR0eXBlAANDVFMAAlMxAAIwMQ..*; nflcs.prod.keyStoreSessionStorage=b7fc6c00-06e5-4748-ba7c-c30c227ddced; ff=uid%3D9d0536bc14cb65c2273a2613687a57f3%26fu%3D21679440%26tz%3DUS%2FEastern%26env%3Dproduction%26g%3D102025%7CL%407528632~PA%20Milk%20Society~1~Building%20Rome%23L%4011776443~Milk%20Dynasty~1~zelinsky%20dynasty%26d%3D1778459408%26h%3D96801851413ca73c6553e425a75e03a1; mbox=session#8b1c2fc4da794a8fa4ebb67b95491fb7#1778461272|PC#8b1c2fc4da794a8fa4ebb67b95491fb7.34_0#1841704212; s_pv=nfl%20fantasy%3Aleague%3Ahome%3Aplayoffs%3Achampionship; OptanonConsent=isGpcEnabled=0&datestamp=Sun+May+10+2026+20%3A30%3A11+GMT-0400+(Eastern+Daylight+Time)&version=202411.1.0&browserGpcFlag=0&isIABGlobal=false&hosts=&consentId=9a61311e-0c53-48df-9187-f67a1fe909bd&interactionCount=2&isAnonUser=1&landingPath=NotLandingPage&GPPCookiesCount=1&gppSid=7&groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1%2CBG462%3A1%2CC0004%3A1&crTime=1778459377310&AwaitingReconsent=false&isDntEnabled=0&prevHadToken=0&intType=3&geolocation=US%3BNY; s_ptc=pt.rdr%240.00%5E%5Ept.apc%240.00%5E%5Ept.dns%240.00%5E%5Ept.tcp%240.00%5E%5Ept.req%240.41%5E%5Ept.rsp%240.00%5E%5Ept.prc%240.54%5E%5Ept.onl%240.00%5E%5Ept.tot%240.96%5E%5Ept.pfi%241; __gads=ID=537194e83375f466:T=1775867998:RT=1778459411:S=ALNI_MYNuhtZvC5ZbGXdtvpnNJFPmdqnyw; __gpi=UID=000013c63ebbb2d4:T=1775867998:RT=1778459411:S=ALNI_MaKzqYF8d2QOOYU3NNPcoDbNhirAA; __eoi=ID=7e2d97ba0c4a65a4:T=1775867998:RT=1778459411:S=AA-AfjYleKqKEh-Kyg-5-R0ZSDSQ; s_sq=nflglobal2016%3D%2526c.%2526a.%2526activitymap.%2526page%253Dnfl%252520fantasy%25253Aleague%25253Ahome%25253Aplayoffs%25253Achampionship%2526link%253DRESEARCH%252520SHOP%252520%2525E2%252598%2525B0%252520FantasyLeagueMy%252520TeamGame%252520CenterPlayersHelpManage%252520PA%252520Milk%252520Society%252520HomeEmail%252520LeagueTeam%252520ManagersDepth%252520ChartsDiscus%2526region%253Dhd%2526pageIDType%253D1%2526.activitymap%2526.a%2526.c%2526pid%253Dnfl%252520fantasy%25253Aleague%25253Ahome%25253Aplayoffs%25253Achampionship%2526pidt%253D1%2526oid%253DfunctionJc%252528%252529%25257B%25257D%2526oidt%253D2%2526ot%253DDIV"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# ---- Scraper behavior ----
REQUEST_DELAY_SECONDS = 1.5
OUTPUT_DIR = "output"
SAVE_RAW_HTML = True

# ============================================================
# League members — your roster of friends, with the names YOU use
# ============================================================
CURRENT_MEMBERS = [
    # (user_id, "Your name for this person", "NFL.com display name")
    (21679440, "Joey",    "Joey"),
    (21679447, "Mason",   "Mason"),
    (21688760, "Sean",    "sean"),
    (21680417, "Chris",   "Chris"),
    (25033943, "Isaac",   "Isaac"),
    (21680087, "Kyle",    "Kyle"),
    (21679454, "Connie",  "Connor"),     # NFL display = Connor, you call him Connie
    (22539599, "Charlie", "Charlie"),
    (25036608, "Luke",    "Luke"),
    (30533399, "Evan",    "Evan"),
    (21680682, "Andrew",  "Ricci"),      # NFL display = Ricci, you call him Andrew
    (21239480, "Connor",  "Cat"),        # NFL display = Cat, you call him Connor
]

# ============================================================
# Former members (alumni) — played at some point, no longer active
# ============================================================
FORMER_MEMBERS = [
    (5159801,  "John",     "David"),     # NFL display = David, you call him John
    (21687512, "Costigan", "Sean"),      # NOT the current Sean
    (21680267, "Krish",    "Krish"),
    (21680276, "CJ",       "CJ"),
    (21687734, "Ari",      "Ari"),
]

# ============================================================
# Playoff structure per season
# ============================================================
# 2019-2020:  reg season W1-13, playoffs W14-16
# 2021+:      reg season W1-14, playoffs W15-17  (NFL added 17th game in 2021)
PLAYOFF_WEEKS = {
    2019: [14, 15, 16],
    2020: [14, 15, 16],
    2021: [15, 16, 17],
    2022: [15, 16, 17],
    2023: [15, 16, 17],
    2024: [15, 16, 17],
    2025: [15, 16, 17],
}

# Number of teams that made the playoffs each year.
# 2020 was an 8-team bracket; every other year was 6 teams.
PLAYOFF_BRACKET_SIZE = {
    2019: 6,
    2020: 8,
    2021: 6,
    2022: 6,
    2023: 6,
    2024: 6,
    2025: 6,
}


def is_playoff_week(season: int, week: int) -> bool:
    return week in PLAYOFF_WEEKS.get(season, [])


def display_name(user_id: int) -> str:
    """Return your custom name for a user_id, or fall back to their NFL display name."""
    for uid, my_name, _nfl_name in CURRENT_MEMBERS + FORMER_MEMBERS:
        if uid == user_id:
            return my_name
    return ""


def is_current_member(user_id: int) -> bool:
    return any(uid == user_id for uid, _, _ in CURRENT_MEMBERS)


def is_former_member(user_id: int) -> bool:
    return any(uid == user_id for uid, _, _ in FORMER_MEMBERS)


def is_known_member(user_id: int) -> bool:
    return is_current_member(user_id) or is_former_member(user_id)