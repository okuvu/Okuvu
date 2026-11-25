# Hinglish worksheet wording — for review, NOT approved

Generated from the catalogue in `packages/shared-types/worksheets`. Do not edit by hand:
change the catalogue, then regenerate.

**Status: not approved.** The English wording was approved by Dr. Shubhangi Goswami
(clinical lead) on 9 November 2026. These Hinglish versions are translations of that
English and need her separate approval. They are stored with the worksheets but the app
does not serve them: `HINGLISH_RELEASED` is `false`, so a client always receives English
until you approve this document.

How to review: each worksheet shows the Hinglish the client would read, with the English
prompt beside it where the two need comparing. Option ids are the stored values and never
change with language, so a client can switch language and keep their answers.

---

## Mood check-in

- id: `mood_checkin`
- Library description (English): Check in with how you're feeling and what set it off.
- Library description (Hinglish): Check in karo ki aap kaisa feel kar rahe ho, aur kis baat ne aisa kar diya.
- who can open it: open

### Hinglish

- **short text** — Aisa feel karne se thoda pehle kya ho raha tha?
  - helper: Koi jagah, koi insaan, koi soch, koi notification, ya kuch bhi nahi. Sab count hota hai.
  - example: Internal marks aa gaye the.
- **scale 0 10** — Abhi ye feeling kitni strong hai?

> Note kar liya. Notice karna ek skill hai, aur aapne abhi use kiya.

### English (approved, for comparison)

- **short text** — What was happening just before you felt this?
  - helper: A place, a person, a thought, a notification, nothing in particular. All of these count.
  - example: Got my internal marks back.
- **scale 0 10** — How strong is this feeling right now?

> Noted. Noticing is a skill, and you just used it.

---

## 5-4-3-2-1 grounding

- id: `grounding_5431`
- Library description (English): 5-4-3-2-1 grounding — notice five things you can see, four you can touch, three you can hear, two you can smell, one you can taste.
- Library description (Hinglish): Paanch cheezein dekho, chaar chizo ko chuo, teen cheezein suno, do cheezein sungo, ek cheez ka swaad lo.
- who can open it: open

### Hinglish

- **scale 0 10** — Ab kaisa lag raha hai?

> Aap yahan ho. Aage badhne se pehle jitna time chahiye le lo.
- button: Mera Treasure Box kholo (`treasure_box`)
- button: Abhi ke liye bas (`done`)

### English (approved, for comparison)

- **scale 0 10** — How are you feeling now?

> You're here. Take whatever time you need before moving on.
- button: Open my Treasure Box (`treasure_box`)
- button: Done for now (`done`)

---

## Thought record

- id: `ws_thought_record`
- Library description (English): Slow down one thought and look at it from a few sides.
- Library description (Hinglish): Ek soch ko dheema karo aur use kai taraf se dekho.
- who can open it: assigned

### Hinglish

> Soch kabhi sach jaisi lagti hai, khaas kar jab woh tezi se aati hai. Ye tareeka ek soch ko dheema karke use kai taraf se dekhne ka hai. Aaj ya is hafte ka ek pal chuno.

- **short text** — Kya hua tha?
  - helper: Bas facts, jaise camera dekhta hai: kahan, kab, kaun.
  - example: Mere dost ne message dekha aur paanch ghante reply nahi kiya.
- **feelings picker** — Aapko kya feel hua, aur kitna strong?
  - feeling `sad`: udaas
  - feeling `scared`: dara hua
  - feeling `angry`: gussa
  - feeling `ashamed`: sharminda
  - feeling `happy`: khush
  - feeling `calm`: shaant
  - feeling `numb`: sunn
  - feeling `worried`: pareshan (under scared)
  - feeling `panicky`: ghabrahat (under scared)
  - feeling `unsafe`: unsafe lag raha (under scared)
  - feeling `on_edge`: chidchida / edge par (under scared)
  - strength prompt: Har ek kitni strong hai?
- **long text** — Dimaag mein kya chala?
  - helper: Soch ko waise likho jaise dimaag mein suni thi, chahe woh extreme lage.
  - example: Woh mujhse chidh gayi hai. Main hamesha galat bolta hoon.
- **short text** — Kaunsi soch sabse strong lagti hai?
- **scale 0 100** — Abhi aap ise kitna sach maante ho?
- **row list** — Kya cheez is soch ko sach jaisa banati hai?
  - helper: Woh cheezein jo sach mein hui, andaze nahi.
  - column `item`: Ise sach jaisa kya banata hai (text)
- **row list** — Kya cheez is soch se poori tarah match nahi karti?
  - helper: Kuch bhi jo bataye ki ye poori kahani nahi ho sakti. Agar abhi kuch na mile, koi baat nahi. Chhod do aur baad mein aao.
  - column `item`: Jo poori tarah match nahi karta (text)
- **long text** — Dono list dekhkar, kya ise dekhne ka koi aur tareeka hai?
  - helper: Ise positive hona zaroori nahi. Bas jo aapne likha, uske saath insaaf karna hai.
- **scale 0 100** — Ab original soch ko kitna sach maante ho?
- **scale 0 10** — Aur ab feeling kitni strong hai?

> Jo bhi mila, aapne apne dimaag ko pyaar se dekha. Yahi practice hai.
- button: Mere Treasure Box mein save karo (`treasure_box`)
- button: Ho gaya (`done`)

### English (approved, for comparison)

> Thoughts can feel like facts, especially when they show up fast. This is a way to slow one down and look at it from a few sides. Pick one moment from today or this week.

- **short text** — What happened?
  - helper: Just the facts, like a camera would see it: where, when, who.
  - example: My friend saw my message and didn't reply for five hours.
- **feelings picker** — What did you feel, and how strongly?
  - feeling `sad`: sad
  - feeling `scared`: scared
  - feeling `angry`: angry
  - feeling `ashamed`: ashamed
  - feeling `happy`: happy
  - feeling `calm`: calm
  - feeling `numb`: numb
  - feeling `worried`: worried (under scared)
  - feeling `panicky`: panicky (under scared)
  - feeling `unsafe`: unsafe (under scared)
  - feeling `on_edge`: on edge (under scared)
  - strength prompt: How strong is each one?
- **long text** — What went through your mind?
  - helper: Write the thought the way it sounded in your head, even if it seems extreme.
  - example: She's annoyed with me. I always say the wrong thing.
- **short text** — Which thought feels the strongest?
- **scale 0 100** — How much do you believe it right now?
- **row list** — What makes this thought feel true?
  - helper: Things that actually happened, not guesses.
  - column `item`: What makes it feel true (text)
- **row list** — What doesn't quite fit with this thought?
  - helper: Anything that suggests it might not be the whole story. If you can't find anything yet, that's okay. Leave it and come back.
  - column `item`: What doesn't quite fit (text)
- **long text** — Looking at both lists, is there another way to see this?
  - helper: This doesn't have to be positive. It just has to be fair to all of what you wrote.
- **scale 0 100** — Now, how much do you believe the original thought?
- **scale 0 10** — And how strong is the feeling now?

> Whatever you found, you looked at your own mind with care. That's the practice.
- button: Save to my Treasure Box (`treasure_box`)
- button: Done (`done`)

---

## Small things planner

- id: `ws_small_things`
- Library description (English): Plan a few small things for the coming days. Tiny is fine.
- Library description (Hinglish): Aane wale dino ke liye kuch chhoti cheezein plan karo. Chhoti bhi theek hai.
- who can open it: assigned

### Hinglish

> Jab mood low hota hai, "man kare tab karunga" ka intezaar bahut lamba ho jaata hai. Kabhi kabhi chhota kaam pehle karna padta hai, aur feeling thodi si peeche aati hai. Kuch chhote kaam plan karo. Bahut chhote bhi chalenge.

- **row list** — Aane wale kuch dino ke liye teen tak chhote kaam plan karo.
  - helper: Ho sake toh mix karo: ek cheez jo aapko pasand hai, ek jo kaam nikal de, ek jo kisi se judne mein madad kare.
  - example: Chai ki thela tak paidal jana · Ek pending email ka jawab · Cousin ko meme bhejna.
  - column `what`: Kya (text)
  - column `when`: Kab (datetime)
- **choice** — Kya aapne kiya?
  - option `yes`: Haan
  - option `partly`: Thoda sa
  - option `no`: Is baar nahi
- **scale 0 10** — Kitna achievement jaisa laga?
- **scale 0 10** — Kitna maza aaya?
- **short text** — Beech mein kya aaya?
  - helper: Koi judgement nahi. Isse aapko aur aapke therapist ko behtar plan banane mein madad milti hai.

> Har chhoti cheez count hoti hai, woh bhi jo nahi hui. Aap seekh rahe ho ki aapke liye kya kaam karta hai.

### English (approved, for comparison)

> When you're low, waiting to feel like doing something can take forever. Sometimes doing a small thing comes first, and the feeling follows a little. Plan a few small things. Tiny is fine.

- **row list** — Plan up to three small things for the next few days.
  - helper: Mix it up if you can: one thing you enjoy, one thing that gets something done, one thing that connects you with someone.
  - example: Walk to the chai stall · Reply to one pending email · Send a meme to my cousin.
  - column `what`: What (text)
  - column `when`: When (datetime)
- **choice** — Did you do it?
  - option `yes`: Yes
  - option `partly`: Partly
  - option `no`: Not this time
- **scale 0 10** — How much did it feel like an achievement?
- **scale 0 10** — How much did you enjoy it?
- **short text** — What got in the way?
  - helper: No judgement. This helps you and your therapist plan better.

> Every small thing counts, including the ones that didn't happen. You're learning what works for you.

---

## Plan a hard conversation

- id: `ws_hard_conversation`
- Library description (English): Plan what you want to say before a difficult conversation.
- Library description (Hinglish): Mushkil baat se pehle plan karo ki aap kya kehna chahte ho.
- who can open it: assigned

### Hinglish

> Kuch maangna, ya na kehna, mushkil hota hai — khaas kar ghar walon ya apne logon ke saath. Pehle se soch lena ki kya kehna hai, ise thoda aasan bana deta hai. Use karna hai ya nahi, kab karna hai, ye aap decide karte ho.

- **short text** — Ye baat kisse karni hai, aur kis baare mein?
  - example: Papa se, gap semester lene ke baare mein.
- **short text** — Aap chahte ho iska natija kya ho?
  - helper: Jitna saaf keh sako kaho, jaise 'Main chahta hoon woh mere reasons sunein' ya 'Main trip ke liye na kehna chahta hoon.'
- **short text** — Describe: Situation kya hai, sirf facts?
- **short text** — Express: Aapko is baare mein kaisa lagta hai? 'I feel…' se shuru karke dekho
- **short text** — Ask: Aap exactly kya maang rahe ho, ya kis baat ko na keh rahe ho?
- **short text** — Reinforce: Ye unke liye bhi achha kyun ho sakta hai, ya rishte ke liye?
- **short text** — Stay on track: Baat bhatak jaaye ya garam ho jaaye, toh wapas aane ke liye aapki ek line kya hogi?
  - example: Main sun raha hoon. Phir bhi chahta hoon ki hum is baare mein sochein.
- **checklist** — Stay steady: Aap kaisa sunai dena chahte ho: shaant, pakka, ya narm?
  - option `calm`: shaant
  - option `firm`: pakka
  - option `kind`: narm
- **short text** — Be open: Poora nahi mila toh aap kya accept kar sakte ho?
- **Text** — Ye aapka plan hai.

> Unka jawab aapke haath mein nahi hai. Aapke haath mein ye hai ki aap kitni saaf tarah se pesh aate ho.
- button: Mere Treasure Box mein save karo (`treasure_box`)
- button: Ho gaya (`done`)

### English (approved, for comparison)

> Asking for something, or saying no, is hard, especially with family or people you care about. Planning what you want to say can make it feel less overwhelming. You choose whether and when to use it.

- **short text** — Who is this conversation with, and what's it about?
  - example: My dad, about taking a gap semester.
- **short text** — What do you want to come out of it?
  - helper: Be as clear as you can, for example 'I want them to hear my reasons' or 'I want to say no to the trip.'
- **short text** — Describe: What's the situation, just the facts?
- **short text** — Express: How do you feel about it? Try starting with 'I feel…'
- **short text** — Ask: What exactly are you asking for, or saying no to?
- **short text** — Reinforce: Why might this be good for them too, or for your relationship?
- **short text** — Stay on track: If the conversation drifts or gets heated, what's one line you can come back to?
  - example: I hear you. I'd still like us to think about this.
- **checklist** — Stay steady: How do you want to sound: calm, firm, kind?
  - option `calm`: calm
  - option `firm`: firm
  - option `kind`: kind
- **short text** — Be open: What could you accept if you can't get everything you want?
- **Text** — Here's your plan.

> You don't control how they respond. You can control how clearly you show up.
- button: Save to my Treasure Box (`treasure_box`)
- button: Done (`done`)

---

## A letter from a kind friend

- id: `ws_kind_friend_letter`
- Library description (English): Write to yourself the way a caring friend would.
- Library description (Hinglish): Khud ko waise likho jaise ek samajhdaar dost likhta.
- who can open it: assigned

### Hinglish

> Hum sab apne aap se waise baat nahi karte jaise dost se karte hain. Ye ek alag awaaz aazmane ka mauka hai.

- **long text** — Haal hi mein aap kis baat par khud ko kaafi kathor rahe ho?
  - helper: Ise waise likho jaise aapka andar ka critic kehta hai.
- **short text** — Kisi aise insaan ko yaad karo jo bina shart aapki parwah karta hai. Woh koi asli insaan ho sakta hai, koi jo aapne socha ho, ya aapka khud ka ek zyada samajhdaar, narm version. Aap kisko yaad kar rahe ho?
- **long text** — Khud ko waise likho jaise woh likhte.
  - helper: Woh kya samajhte honge ki ye mushkil kyun hai? Woh aapko kya batana chahte honge? Woh aapke liye kya ummeed rakhte honge?
- **short text** — Apna khat dobara padho. Padhkar kaisa lagta hai?
  - helper: Agar ajeeb ya jhoota lage, toh ye bahut aam hai. Khud par narmi practice se aati hai.

> Jab zaroorat ho, aap is khat par wapas aa sakte ho.
- button: Mere Treasure Box mein save karo (`treasure_box`)
- button: Ho gaya (`done`)

### English (approved, for comparison)

> Most of us talk to ourselves in ways we'd never talk to a friend. This is a chance to try a different voice.

- **long text** — What's something you've been hard on yourself about lately?
  - helper: Write it the way your inner critic says it.
- **short text** — Picture someone who cares about you without conditions. It can be a real person, someone you've imagined, or a wiser, kinder version of you. Who are you picturing?
- **long text** — Write to yourself as they would.
  - helper: What would they understand about why this is hard?, What would they want you to know?, What would they hope for you?
- **short text** — Read your letter back. How does it feel to read it?
  - helper: If it feels awkward or untrue, that's very common. Kindness towards yourself can take practice.

> You can come back to this letter whenever you need it.
- button: Save to my Treasure Box (`treasure_box`)
- button: Done (`done`)

---

## Energy audit

- id: `ws_energy_audit`
- Library description (English): See what drains your energy and what fills it back up.
- Library description (Hinglish): Dekho aapki energy kya kha raha hai aur kya wapas bhar raha hai.
- who can open it: open

### Hinglish

> Kuch cheezein utna deti nahi jitna le leti hain. Kuch chup-chaap aapko bhar deti hain. Chalo aapka hafta dekhein.

- **row list** — Is hafte aapki energy kaunsi cheezein kha rahi hain?
  - example: Lagaatar classes · Family WhatsApp group · Raat 2 baje tak scrolling.
  - column `item`: Energy khaane wali (text)
  - column `how_much`: Kitna? (scale_0_10)
- **row list** — Kaunsi cheezein aapko energy de rahi hain, thodi si bhi?
  - example: Shaam ki walk · Roommate ke saath khana banana · Sunday ka cricket.
  - column `item`: Energy dene wali (text)
  - column `how_much`: Kitna? (scale_0_10)
- **long text** — Dono list dekhkar kya notice karte ho?
- **short text** — Koi ek cheez jo energy kha rahi hai, use thoda kam kar sakte ho? Ya koi ek cheez jo energy deti hai, is hafte thodi zyada kar sakte ho?
  - helper: Chhote badlav bhi count hote hain. Agar abhi kuch bhi possible na lage, toh woh bhi jaanna kaam ka hai.

> Aapki energy kahan jaati hai, ye jaanna use bachane ka pehla kadam hai.

### English (approved, for comparison)

> Some things take more out of you than they give back. Others quietly fill you up. Let's look at your week.

- **row list** — What's been draining your energy this week?
  - example: Back-to-back classes · Family WhatsApp group · Scrolling till 2 am.
  - column `item`: Draining (text)
  - column `how_much`: How much? (scale_0_10)
- **row list** — What's been giving you energy, even a little?
  - example: Evening walk · Cooking with my roommate · Cricket on Sunday.
  - column `item`: Giving energy (text)
  - column `how_much`: How much? (scale_0_10)
- **long text** — Looking at both lists, what do you notice?
- **short text** — Is there one drain you could shrink a little, or one source you could add a bit more of this week?
  - helper: Tiny changes count. If nothing feels possible right now, that's useful to know too.

> Knowing where your energy goes is the first step to protecting it.

---

## What I want to bring to session

- id: `ws_bring_to_session`
- Library description (English): Jot down what you'd like to talk about next session.
- Library description (Hinglish): Agle session mein kya baat karni hai, likh lo.
- who can open it: open

### Hinglish

> Session jaldi nikal jaate hain, aur bahut baatein dimaag se nikal jaati hain. Jo kehna chahte ho woh likh lo, taaki waqt par taiyaar ho.

- **long text** — Pichhle session se ab tak kya cheez dimaag mein rahi?
- **long text** — Koi aisi baat hai jo bolne mein mushkil lag rahi hai?
  - helper: Pehle yahan likh sakte ho. Share karna hai ya nahi, ye aap decide karte ho.
- **short text** — Agar agle session se ek cheez lekar jaana ho, woh kya hogi?
  - example: Exam week ka plan · Bas suna hua mehsoos karna.
- **choice** — Session se pehle therapist ke saath share karna hai?
  - option `share`: Share karo
  - option `private`: Private rakho

> Jab aap taiyaar ho.

### English (approved, for comparison)

> Sessions can go by fast, and things slip your mind. Jot down what you'd like to talk about, so it's ready when you need it.

- **long text** — What's been on your mind since last session?
- **long text** — Is there anything you've been finding hard to say out loud?
  - helper: You can write it here first. You decide whether to share it.
- **short text** — If you could leave next session with one thing, what would it be?
  - example: A plan for exam week · Just feeling heard.
- **choice** — Share with your therapist before the session?
  - option `share`: Share
  - option `private`: Keep private

> Ready when you are.

---

## My plan for hard moments

- id: `ws_safety_plan`
- Library description (English): The plan you made with your therapist for hard moments.
- Library description (Hinglish): Mushkil palon ke liye woh plan jo aapne therapist ke saath banaya.
- who can open it: in_session

### Hinglish

> Ye aapne apne therapist ke saath un waqton ke liye banaya hai jab sab kuch bahut zyada lagta hai. Jab zaroorat ho, ye yahan hai.

- **row list** — Mushkil waqt aane ke sanket
  - column `item`: Sanket (text)
- **row list** — Woh cheezein jo main akela kar sakta hoon
  - column `item`: Kya madad karta hai (text)
- **row list** — Log aur jagah jo dhyan hataane mein madad karte hain
  - column `item`: Kaun ya kahan (text)
- **row list** — Log jinse main madad maang sakta hoon
  - column `name`: Naam (text)
  - column `phone`: Phone (text)
- **Text** — Professional aur crisis support
- **row list** — Apne aas-paas ko safe banana
  - column `item`: Kya safe banata hai (text)
- **short text** — Ek wajah jo mere liye maayne rakhti hai
- button: Abhi madad lo (`get_help`)

### English (approved, for comparison)

> You made this with your therapist for times when things feel too much. It's here whenever you need it.

- **row list** — Signs a hard moment might be coming
  - column `item`: Sign (text)
- **row list** — Things I can do on my own to get through it
  - column `item`: What helps (text)
- **row list** — People and places that help take my mind off it
  - column `item`: Who or where (text)
- **row list** — People I can ask for help
  - column `name`: Name (text)
  - column `phone`: Phone (text)
- **Text** — Professional and crisis support
- **row list** — Making my surroundings safer
  - column `item`: What makes it safer (text)
- **short text** — One reason that matters to me
- button: Get help now (`get_help`)

---

## Name the feeling

- id: `ws_name_the_feeling`
- Library description (English): Find a more exact word for what you're feeling, and where you feel it.
- Library description (Hinglish): Jo aap feel kar rahe ho uske liye zyada sahi shabd dhoondo, aur kahan feel hota hai woh bhi.
- who can open it: open

### Hinglish

> Kabhi kabhi sab kuch bas 'bura' ya 'theek nahi' lagta hai. Feeling ko zyada sahi naam dene se use sambhalna thoda aasan ho sakta hai.

- **feelings picker** — Jo abhi ho raha hai, uske sabse kareeb feeling chuno.
  - feeling `sad`: udaas
  - feeling `scared`: dara hua
  - feeling `angry`: gussa
  - feeling `ashamed`: sharminda
  - feeling `happy`: khush
  - feeling `calm`: shaant
  - feeling `numb`: sunn
  - feeling `worried`: pareshan (under scared)
  - feeling `panicky`: ghabrahat (under scared)
  - feeling `unsafe`: unsafe lag raha (under scared)
  - feeling `on_edge`: chidchida / edge par (under scared)
  - strength prompt: Har ek kitni strong hai?
- **checklist** — Body mein kahan mehsoos hota hai?
  - helper: Koi galat jawab nahi hai. Kuch feelings body mein dikhti hi nahi.
  - option `head`: sar
  - option `jaw`: jabda
  - option `throat`: gala
  - option `chest`: seene
  - option `stomach`: pet
  - option `shoulders`: kandhe
  - option `hands`: haath
  - option `legs`: pair
  - option `nowhere`: kuch bhi mehsoos nahi hota
- **short text** — Agar ye feeling ek line bol sakti, toh kya kehti?
  - example: Ise bigaadna mat.

> Aapne ise naam de diya. Samajhne ki taraf ye ek kadam hai.

### English (approved, for comparison)

> Sometimes everything just feels like 'bad' or 'off.' Putting a more exact name on a feeling can make it a little easier to hold.

- **feelings picker** — Pick the feeling closest to what's going on.
  - feeling `sad`: sad
  - feeling `scared`: scared
  - feeling `angry`: angry
  - feeling `ashamed`: ashamed
  - feeling `happy`: happy
  - feeling `calm`: calm
  - feeling `numb`: numb
  - feeling `worried`: worried (under scared)
  - feeling `panicky`: panicky (under scared)
  - feeling `unsafe`: unsafe (under scared)
  - feeling `on_edge`: on edge (under scared)
  - strength prompt: How strong is each one?
- **checklist** — Where do you notice it in your body?
  - helper: There's no wrong answer. Some feelings don't show up in the body at all.
  - option `head`: head
  - option `jaw`: jaw
  - option `throat`: throat
  - option `chest`: chest
  - option `stomach`: stomach
  - option `shoulders`: shoulders
  - option `hands`: hands
  - option `legs`: legs
  - option `nowhere`: nowhere I can tell
- **short text** — If this feeling could say one sentence, what would it say?
  - example: Don't mess this up.

> You gave it a name. That's a step towards understanding it.

---

## Breathing

- id: `breathing`
- Library description (English): Slow your breathing with four short exercises.
- Library description (Hinglish): Chaar chhoti exercises se apni breathing dheemi karo.
- who can open it: open

### Hinglish

- **scale 0 10** — Ab kaisa lag raha hai?

### English (approved, for comparison)

- **scale 0 10** — How are you feeling now?

---

## Spot the thinking trap

- id: `ws_thinking_trap`
- Library description (English): Notice when a thought is taking a mental shortcut.
- Library description (Hinglish): Dhyan do jab koi soch dimaag ka shortcut le rahi ho.
- who can open it: assigned

### Hinglish

> Dimaag ke paas shortcuts hote hain. Woh tez hote hain, par kabhi kabhi galat jagah le jaate hain. Dekho kya inme se kuch jaana-pehchana lagta hai.

- **short text** — Ek soch likho jo pareshan kar rahi hai.
- **checklist** — Kya ye in patterns mein se kisi se match karti hai?
  - option `mind_reading`: Mind reading — bina poochhe maan lena ki doosre kya soch rahe hain.
  - option `fortune_telling`: Fortune telling — pakka maan lena ki kuch bura hi hoga.
  - option `all_or_nothing`: All-or-nothing — perfect nahi toh fail.
  - option `catastrophising`: Catastrophising — seedha sabse bura anjaam soch lena.
  - option `should_statements`: Should statements — sakht niyam ki mujhe ya doosron ko aisa hi hona chahiye.
  - option `labelling`: Labelling — kya hua ye batane ke bajaye khud ko ek naam de dena.
  - option `discounting_the_good`: Discounting the good — achhi cheezein ginne layak nahi maanna.
  - option `emotional_reasoning`: Emotional reasoning — mujhe aisa lagta hai, isliye sach hoga.
  - option `none`: Inme se kuch bhi match nahi karta.
- **long text** — Naam dene ke baad ab kya notice karte ho?

> Pattern pehchanne se feeling galat nahi ho jaati. Bas thodi si jagah ban jaati hai.

### English (approved, for comparison)

> Our minds have shortcuts. They're quick, but sometimes they take us somewhere unfair. See if any of these sound familiar.

- **short text** — Write down a thought that's been bothering you.
- **checklist** — Does it fit any of these patterns?
  - option `mind_reading`: Mind reading — guessing what others think without checking.
  - option `fortune_telling`: Fortune telling — being sure something will go badly.
  - option `all_or_nothing`: All-or-nothing — if it's not perfect, it's a failure.
  - option `catastrophising`: Catastrophising — jumping to the worst possible outcome.
  - option `should_statements`: Should statements — strict rules about how I or others must be.
  - option `labelling`: Labelling — calling myself a name instead of describing what happened.
  - option `discounting_the_good`: Discounting the good — deciding positives don't count.
  - option `emotional_reasoning`: Emotional reasoning — I feel it, so it must be true.
  - option `none`: None of these fit.
- **long text** — What do you notice now that you've named it?

> Spotting a pattern doesn't make the feeling wrong. It just gives you a little more room.

---

## Values compass

- id: `ws_values_compass`
- Library description (English): Notice what matters to you, and take one small step towards it.
- Library description (Hinglish): Dekho aapke liye kya maayne rakhta hai, aur us taraf ek chhota kadam lo.
- who can open it: assigned

### Hinglish

> Goals woh cheezein hain jo poori ho jaati hain. Values woh disha hain jinme aap chalte rehte ho, jaise ek samajhdaar dost hona ya seekhte rehna. Ye aapko dekhne mein madad karta hai ki aapke liye kya maayne rakhta hai.

- **checklist** — Abhi zindagi ke kaunse hisse aapke liye sabse zyada maayne rakhte hain?
  - option `family`: parivaar
  - option `friendships`: dost
  - option `love`: pyaar aur rishtey
  - option `studies_work`: padhai ya kaam
  - option `health`: sehat aur body
  - option `fun_rest`: masti aur aaram
  - option `community`: samaaj aur doosron ki madad
  - option `growth`: seekhna aur aage badhna
  - option `faith`: vishwas ya aadhyatm
- **row list** — Har hisse ke liye: wahan aap kaise insaan banna chahte ho?
  - helper: Bataye ki aap kaise pesh aana chahte ho, ye nahi ki kya paana chahte ho.
  - example: Dosti ke liye: "Woh insaan jo mushkil ho tab bhi saath khada ho."
  - column `area`: Hissa (text)
  - column `person`: Kaise insaan (text)
- **row list** — Abhi aap us hisse mein kitna karib jee rahe ho?
  - helper: Ye aapke achhe hone ka score nahi hai. Bas batata hai ki aap kahan jaana chahte ho.
  - column `area`: Hissa (text)
  - column `closeness`: Kitna karib (scale_0_10)
- **short text** — Ek hissa chuno. Is hafte ek chhoti cheez kya ho sakti hai jo us disha mein le jaaye?
- **datetime** — Kab kar sakte ho?

> Jis disha ki aapko parwah hai, us taraf kadam ke liye taiyaar mehsoos karna zaroori nahi.
- button: Mere Treasure Box mein save karo (`treasure_box`)
- button: Ho gaya (`done`)

### English (approved, for comparison)

> Goals are things you finish. Values are directions you keep walking in, like being a caring friend or someone who keeps learning. This helps you notice what matters to you.

- **checklist** — Which areas of life matter most to you right now?
  - option `family`: family
  - option `friendships`: friendships
  - option `love`: love and relationships
  - option `studies_work`: studies or work
  - option `health`: health and body
  - option `fun_rest`: fun and rest
  - option `community`: community and giving back
  - option `growth`: growth and learning
  - option `faith`: faith or spirituality
- **row list** — For each area: what kind of person do you want to be there?
  - helper: Describe how you want to act, not what you want to get.
  - example: For friendships: "Someone who shows up, even when it’s inconvenient."
  - column `area`: Area (text)
  - column `person`: What kind of person (text)
- **row list** — How close are you living to that right now?
  - helper: This isn't a score of how good you are. It just shows where you'd like to move.
  - column `area`: Area (text)
  - column `closeness`: How close (scale_0_10)
- **short text** — Pick one area. What's one small thing you could do this week that points in that direction?
- **datetime** — When could you do it?

> You don't need to feel ready to take a step in a direction you care about.
- button: Save to my Treasure Box (`treasure_box`)
- button: Done (`done`)

---

## Three good things

- id: `ws_three_good_things`
- Library description (English): Notice three things that went okay today.
- Library description (Hinglish): Aaj teen cheezein dekho jo theek se hui hain.
- who can open it: open

### Hinglish

> Dimaag ko yaad rehta hai ki kya galat hua. Ye practice hai dekhne ki kya theek hua. Chhoti aur aam cheezein bhi perfect hain.

- **short text** — Aaj ek cheez kya theek hui?
  - example: Auto wale ne kiraye par baat nahi ki.
- **short text** — Aur ek?
- **short text** — Aur ek?
- **short text** — Ek chuno. Isme aapka kya hissa tha, thoda sa bhi?

> Dekha aur sambhal ke rakha.
- button: Mere Treasure Box mein save karo (`treasure_box`)

### English (approved, for comparison)

> Our brains are good at remembering what went wrong. This is practice in noticing what went okay. Small and ordinary is perfect.

- **short text** — What's one thing that went okay today?
  - example: The auto driver didn't argue about the fare.
- **short text** — And another?
- **short text** — And one more?
- **short text** — Pick one. What part did you play in it, even a small one?

> Noticed and kept.
- button: Save to my Treasure Box (`treasure_box`)

---

## Post-session takeaway

- id: `ws_post_session`
- Library description (English): Catch what stood out from today's session before it slips away.
- Library description (Hinglish): Aaj ke session ki sabse badi baat sambhal lo, isse pehle ki woh bhool jaaye.
- who can open it: open

### Hinglish

> Session ke turant baad accha waqt hota hai ye dekhne ka ki kya baat alag laghi, isse pehle ki din aage badh jaaye.

- **long text** — Aaj se ek cheez kya yaad rakhna chahte ho?
  - example: Anxious lagne ka matlab ye nahi ki kuch bura hone wala hai.
- **short text** — Koi cheez hai jo agle session se pehle try karna chahte ho?
- **short text** — Koi baat jo theek nahi lagi, ya jispe wapas aana chahte ho?
  - helper: Session ki kisi baat se sehmat na hona theek hai. Woh agli baar uthane layak hai.
- **choice** — Pehla jawab apne Treasure Box mein save karein?
  - option `save`: Save karo
  - option `not_now`: Abhi nahi

> Jab bhi zaroorat ho, sambhal ke rakha hai.

### English (approved, for comparison)

> Right after a session is a good time to catch what stood out, before the day carries on.

- **long text** — What's one thing you want to remember from today?
  - example: Feeling anxious doesn't mean something bad is about to happen.
- **short text** — Was there anything you'd like to try before next time?
- **short text** — Anything that didn't sit right, or that you'd like to come back to?
  - helper: It's okay to disagree with something from session. That's worth bringing up next time.
- **choice** — Save the first answer to your Treasure Box?
  - option `save`: Save it
  - option `not_now`: Not now

> Kept safe for whenever you need it.

---

## Basics check

- id: `ws_basics_check`
- Library description (English): A quick look at the everyday basics, and one to look after today.
- Library description (Hinglish): _missing_
- who can open it: open

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> When you're running on empty, the basics are usually the first to go — and the hardest to notice. This is a quick look, not a test.

- **checklist** — Which of these have you had in the last day or two?
  - helper: Tick what's true. Nothing here is graded.
  - option `slept`: slept enough
  - option `ate`: ate proper meals
  - option `moved`: moved my body
  - option `break`: took a break
  - option `outside`: went outside
  - option `talked`: talked to someone
- **scale 0 10** — How empty does my tank feel?
- **short text** — One basic I'll look after today
  - helper: Pick the easiest one, not the most important one.
  - example: Go to bed by eleven. Text my sister back.

> One basic, done today, is worth more than a perfect plan for next week.

---

## Boundary planner

- id: `ws_boundary_planner`
- Library description (English): Work out what you want to say no to, and the words to say it.
- Library description (Hinglish): _missing_
- who can open it: assigned

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> A boundary is a sentence about what you can and can't do. It's easier to say when you've decided the words before you need them.

- **short text** — What's the situation?
  - helper: A few words is enough.
  - example: My manager keeps adding work at 7pm.
- **short text** — Who is it with?
  - helper: A name, a role, or just 'someone at home'.
- **short text** — What do you want to say no to?
  - example: Taking on another project this month.
- **long text** — What will you say? Write it the way you'd actually say it.
  - helper: Short and plain usually works better than a speech. You can change it after you've said it out loud once.
  - example: I can't take another project this month. I can start it in December.
- **scale 0 10** — How hard does this feel to say?
- **Closing reflection** — What would make it a little easier to say?
  - helper: Where you say it, who is nearby, what you do straight afterwards.

> You're allowed to take up space in your own life.

---

## Worry tree

- id: `ws_worry_tree`
- Library description (English): Sort the worries you can act on from the ones that just keep circling.
- Library description (Hinglish): Jo worries aap solve kar sakte ho unhe unse alag karo jo bas ghoomti rehti hain.
- who can open it: assigned

### Hinglish

> Kuch worries ke liye kuch karna padta hai. Kuch bas ghoomti rehti hain. Ye unhe alag karne mein madad karta hai.

- **short text** — Worry kya hai?
  - example: Agar is saal placement nahi mili toh?
- **choice** — Ye ab ho rahi kisi cheez ke baare mein hai, ya aage ke "kya hoga" ke baare mein?
  - option `now`: Ab ho rahi koi cheez
  - option `what_if`: Aage ka "kya hoga"
- **choice** — Kya aap iske baare mein kuch kar sakte ho?
  - option `yes`: Haan
  - option `not_now`: Abhi nahi
- **short text** — Ek chhota kadam kya ho sakta hai, aur kab kar sakte ho?
- **datetime** — Kab kar sakte ho?
- **datetime** — Ise worry time ke liye park kar do.
  - helper: Jab us time se pehle worry aaye, khud ko yaad dilao: 'Iske liye mere paas time hai.' Phir apna dhyan wapas us kaam par lao jo kar rahe ho.
- **long text** — Jo park kiya tha use dobara dekho. Kya ab bhi utna urgent lagta hai? Ab iske baare mein kuch kar sakte ho?

> Sab kuch ek saath solve karna zaroori nahi.

### English (approved, for comparison)

> Some worries need action. Others just keep circling. This helps you sort which is which.

- **short text** — What's the worry?
  - example: What if I don't get placed this year?
- **choice** — Is this about something happening now, or a 'what if' about later?
  - option `now`: Something happening now
  - option `what_if`: A 'what if'
- **choice** — Is there anything you can do about it?
  - option `yes`: Yes
  - option `not_now`: Not right now
- **short text** — What's one small step, and when could you do it?
- **datetime** — When could you do it?
- **datetime** — Park it for worry time.
  - helper: When the worry shows up before then, remind yourself: 'I've got a time for this.' Then bring your attention back to what you're doing.
- **long text** — Look back at what you parked. Does it still feel as urgent? Is there anything you can do about it now?

> You don't have to solve everything at once.

---

## What's on my plate

- id: `ws_whats_on_my_plate`
- Library description (English): Put everything down in one place, then decide what can wait.
- Library description (Hinglish): _missing_
- who can open it: open

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> When everything is in your head at once, it can all feel equally urgent. Writing it down helps you see what's actually there — and what can wait.

- **row list** — What's on your plate right now?
  - helper: One thing per line. Anything counts — big, small, work, home, the message you keep meaning to send.
  - column `task`: What (text)
  - column `plan`: What I'll do with it (choice)
- **Closing reflection** — Was anything easier to decide once you saw it written down?
  - helper: There's no right answer. This is just for you.

> You don't have to do all of it. Deciding what can wait is part of the work.

---

## Rest break

- id: `ws_rest_break`
- Library description (English): Stop for a few minutes on purpose, with nothing to show for it.
- Library description (Hinglish): _missing_
- who can open it: open

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> Rest is not a reward you earn after everything else is done. It's part of how you keep going.

- **choice** — How long do you want to stop for?
  - option `two`: 2 minutes
  - option `five`: 5 minutes
  - option `ten`: 10 minutes
- **countdown timer** — You have permission to stop. Nothing needs to be earned first.
  - helper: Sit, lie down, look out of the window. Doing nothing is the point.
- **countdown timer** — You have permission to stop. Nothing needs to be earned first.
  - helper: Put the phone down if you can. The world will still be there after.
- **countdown timer** — You have permission to stop. Nothing needs to be earned first.
  - helper: Ten minutes is a real rest, not a long one. You can stop earlier if you want.
- **Closing reflection** — Anything different after stopping for a moment?
  - helper: Optional. A word is enough.

> Stopping is a skill. You just practised it.

---

## Doomscroll log

- id: `ws_scrolling_log`
- Library description (English): Note when you scrolled, how long, and how it felt before and after.
- Library description (Hinglish): _missing_
- who can open it: open

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> Scrolling isn't a moral failure. It's easier to change when you can see what it does for you — and what it costs.

- **datetime** — When did this happen?
- **choice** — How long were you scrolling?
  - option `under_15`: Under 15 minutes
  - option `15_to_60`: 15–60 minutes
  - option `over_hour`: Over an hour
- **feelings picker** — How did you feel just before you picked up your phone?
  - feeling `sad`: sad
  - feeling `scared`: scared
  - feeling `angry`: angry
  - feeling `ashamed`: ashamed
  - feeling `happy`: happy
  - feeling `calm`: calm
  - feeling `numb`: numb
  - feeling `worried`: worried (under scared)
  - feeling `panicky`: panicky (under scared)
  - feeling `unsafe`: unsafe (under scared)
  - feeling `on_edge`: on edge (under scared)
- **feelings picker** — And afterwards?
  - feeling `sad`: sad
  - feeling `scared`: scared
  - feeling `angry`: angry
  - feeling `ashamed`: ashamed
  - feeling `happy`: happy
  - feeling `calm`: calm
  - feeling `numb`: numb
  - feeling `worried`: worried (under scared)
  - feeling `panicky`: panicky (under scared)
  - feeling `unsafe`: unsafe (under scared)
  - feeling `on_edge`: on edge (under scared)
- **short text** — What pulled you in?
  - helper: Boredom, a notification, a feeling you didn't want, a habit. All of these count.

> Noticing is the whole exercise. Nothing here has to be different next time.

---

## Unsent letter

- id: `ws_unsent_letter`
- Library description (English): Write what was never said, then choose whether to keep it.
- Library description (Hinglish): _missing_
- who can open it: assigned

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> Some things never got said, and maybe they never will. Writing them down, with no plan to send them, can make a little more room inside you.

- **short text** — Who is this letter to?
  - helper: A name, a relationship, or just 'someone I used to know'. You don't have to explain.
- **long text** — Write the letter.
  - helper: Nobody reads this unless you choose to share it. If something you write sounds like you might not be safe, OKUVU will check in with you and may let your therapist know.
- **choice** — What would you like to do with it now?
  - helper: Keeping it saves it in Past me, private unless you share it later. Deleting removes it straight away.
  - option `keep`: Keep it privately
  - option `delete`: Delete it — This deletes the letter. If OKUVU already checked in about something you wrote, your therapist may still know that a check-in happened.

> You wrote it, and you decided what happens to it. Both of those are yours.

---

## Priority sorter

- id: `ws_priority_sorter`
- Library description (English): Sort what you are carrying into four boxes, then pick one to start.
- Library description (Hinglish): _missing_
- who can open it: assigned

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> Not everything urgent is important, and not everything important is urgent. Sorting it takes a minute and saves a lot.

- **row list** — Add the things you're carrying.
  - helper: Urgent means it needs doing soon. Important means it matters to you. Most things are only one of the two.
  - column `task`: What (text)
  - column `box`: Which box (choice)
- **short text** — Which one will you do first?
  - helper: One only. The rest can wait their turn.

> You don't have to do it all today. You just have to know what's first.

---

## Weekly load check

- id: `ws_weekly_load_check`
- Library description (English): Look at how much you carried this week, and what it was made of.
- Library description (Hinglish): _missing_
- who can open it: assigned

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> Once a week, it helps to look at how much you were carrying — not to judge it, just to see it.

- **scale 0 10** — How heavy did this week feel?
- **row list** — What were the biggest things you carried this week?
  - helper: Work, people, money, health, things you kept saying you would do.
  - column `demand`: What (text)
- **Closing reflection** — What do you notice, looking at this week?
  - helper: You can see your past weeks in Past me, under this worksheet.

> However heavy the week was, you carried it. That counts.

---

## SOS calm

- id: `ws_sos_calm`
- Library description (English): One tap: a long breath out, then look around the room. Nothing to type.
- Library description (Hinglish): _missing_
- who can open it: open

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> You don't have to explain anything. Let's take one long breath out first, then notice what's around you.

- **Text** — Start with the long breath out. It's one breath, then another — you can stop whenever you want.

> Stay here as long as you need.

---

## Pressure map

- id: `ws_family_expectations`
- Library description (English): See where the pressure comes from, and whose expectation it really is.
- Library description (Hinglish): _missing_
- who can open it: assigned

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> A lot of pressure comes from what we think other people expect. Mapping it shows which of it is yours, and which you picked up somewhere else.

- **row list** — Which areas are carrying expectations?
  - helper: One line for each area that applies — studies, career, money, family, marriage, friends, the future. Skip the ones that carry nothing.
  - column `area`: Area (choice)
  - column `who`: Who expects what? (text)
  - column `heavy`: How heavy does it feel? (scale_0_10)
  - column `whose`: Whose expectation is it mostly? (choice)
- **Closing reflection** — What do you notice, seeing them side by side?
  - helper: Optional.

> Naming whose expectation it is doesn't settle it. It does make it easier to see.

---

## Weighing it up

- id: `ws_pros_cons_change`
- Library description (English): Look at both sides of changing, and of staying the same.
- Library description (Hinglish): _missing_
- who can open it: assigned

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> When part of you wants to change and part of you doesn't, that's not a flaw. It's worth looking at both sides slowly.

- **short text** — What change are you thinking about?
  - helper: A sentence is enough. You can be as general or as specific as you like.
- **long text** — What might be good about this change?
  - helper: Even small good things. Nothing is too obvious.
- **long text** — What might be good about not making this change?
  - helper: There's usually something, or it would be easier to change.
- **long text** — What might this change cost you?
  - helper: Time, comfort, people, the way things are now.
- **long text** — What might not making this change cost you?
  - helper: It's alright if this is hard to answer. Take your time.
- **scale 0 10** — How ready do you feel to change, right now?
  - helper: There's no right number. Readiness can change from day to day.
- **Closing reflection** — What do you notice, seeing all four side by side?
  - helper: Optional.

> Noticing both sides is not the same as staying stuck.

---

## Caring load check

- id: `ws_caring_load_check`
- Library description (English): Name the caring you carry, and one bit of help you could ask for.
- Library description (Hinglish): _missing_
- who can open it: assigned

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> Looking after other people is real work, even when nobody counts it as work. This is a place to put it down for a minute.

- **checklist** — Which of these are you carrying at the moment?
  - helper: Tick as many as are true. Some of them are easy to miss.
  - option `family_member`: looking after a family member
  - option `household`: the household
  - option `money`: money and bills
  - option `emotional`: emotional support for someone
  - option `admin`: appointments and paperwork
  - option `other`: something else
- **scale 0 10** — How stretched do you feel?
- **short text** — One bit of help you could ask for
  - helper: It can be small. Someone else making dinner once. An hour to yourself.

> Asking for help is part of caring, not a break from it.

---

## Worry time

- id: `ws_worry_time`
- Library description (English): Give worrying one time and one place, instead of all day.
- Library description (Hinglish): _missing_
- who can open it: assigned

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> Worrying has a way of spreading across the whole day. Giving it one time and one place doesn't make it disappear — it gives it somewhere to wait.

- **datetime** — What time each day do you want to give it?
  - helper: Pick a time when you can usually stop for a bit. It doesn't have to be perfect, and you can move it later.
- **choice** — How long do you want?
  - helper: A shorter window is easier to keep. You can always finish early.
  - option `ten`: 10 minutes
  - option `fifteen`: 15 minutes
  - option `twenty`: 20 minutes
- **row list** — What's parked for that time?
  - helper: During the day, when a worry turns up, put it here instead of carrying it round. When your worry time comes, come back and look at each one.
  - column `worry`: The worry (text)
  - column `review`: When you came back to it (choice)
- **Closing reflection** — What do you notice about the ones you parked?
  - helper: Optional. A word is enough.

> A worry kept for later is a worry you're not carrying all day.

---

## Brain-dump

- id: `ws_brain_dump`
- Library description (English): Empty the whole swirl onto one page, then decide whether to keep it.
- Library description (Hinglish): _missing_
- who can open it: open

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> Nothing here has to be tidy. Put the whole swirl down in one place, and let it be as messy as it actually is.

- **long text** — What's in your head right now?
  - helper: One long list is fine. Nothing has to be in order. You can type this or say it out loud — whichever is easier.
- **choice** — What would you like to do with it?
  - option `keep`: Save it — It goes into Past me, private unless you choose to share it.
  - option `delete`: Let it go — This deletes it straight away. If OKUVU already checked in about something you wrote, your therapist may still know that a check-in happened.

> You got it out of your head. That's the whole job.

---

## Big day planner

- id: `ws_exam_career_pressure`
- Library description (English): Get the practical parts of a big day out of your head and onto one page.
- Library description (Hinglish): _missing_
- who can open it: open

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> Big days take up a lot of room in your head. Putting the practical parts somewhere helps you keep your head for the day itself.

- **datetime** — When is it?
  - helper: The date is enough.
- **row list** — What needs doing before then?
  - helper: One step per line, with the day you will do it. Small steps are easier to keep.
  - column `step`: What (text)
  - column `by_when`: By when (datetime)
- **checklist** — On the day
  - helper: Tick these as they happen. Nothing here is a rule.
  - option `eat`: eat something before I go
  - option `leave_early`: leave earlier than I need to
  - option `take`: take what I need with me
  - option `quiet_phone`: put my phone on silent
  - option `arrive`: get there and sit down for a minute
  - option `afterwards`: plan something kind for afterwards
- **short text** — What do you want to remember on the day?
  - helper: One sentence you'd want to read at the door.
  - example: I've done the work. I just have to turn up.

> The day will go how it goes. You'll have done what you could.

---

## Unhooking from a thought

- id: `ws_unhooking`
- Library description (English): Say a thought back to yourself as a thought, and notice if it loosens.
- Library description (Hinglish): _missing_
- who can open it: assigned

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> A thought can feel like a fact about the world. Saying it back as a thought, in your own words, helps it sound like what it is: a thought.

- **short text** — What's the thought that keeps coming?
  - helper: Write it the way it arrives, exactly as harsh as it sounds. Nothing here is edited.
- **scale 0 100** — How much do you believe it right now?
- **echo** — Here it is again, a little further away.
  - helper: These are your own words. Nothing has been changed.
- **scale 0 100** — And now, having read it back?
- **Closing reflection** — What's different, if anything, about the thought now?
  - helper: Optional. Nothing has to have changed.

> The thought didn't have to change for you to step back from it.

---

## Social situation prep

- id: `ws_social_situation_prep`
- Library description (English): Write the prediction before, and what actually happened after.
- Library description (Hinglish): _missing_
- who can open it: assigned

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> Before something social, the mind often writes the ending in advance. This is somewhere to write that ending down — and then, later, what actually happened.

- **short text** — What's the situation?
  - helper: A few words is enough.
  - example: Drinks with the team on Friday.
- **short text** — What do you think will happen?
  - helper: The version your mind keeps showing you, in its own words.
- **scale 0 10** — How worried do you feel about it?
- **short text** — One small thing you'll try
  - helper: Small is the point. Say one sentence. Stay ten minutes. Arrive and leave when you like.
- **choice** — If you have done it — how did it go?
  - helper: Leave this until afterwards. You can come back to this worksheet.
  - option `as_feared`: Went as feared
  - option `better`: Better than feared
  - option `didnt_do`: Didn't do it
- **short text** — What actually happened?
  - helper: Just what happened, in plain words.
- **short text** — What got in the way?
  - helper: No judgement. This helps you and your therapist plan better.

> A prediction written down is a prediction you can check.

---

## Sitting with not knowing

- id: `ws_sitting_with_not_knowing`
- Library description (English): Let one unanswered question stay open, and see how it feels afterwards.
- Library description (Hinglish): _missing_
- who can open it: assigned

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> Some things don't have an answer yet. Trying to force one can keep you stuck. This is a few minutes of letting a question stay open.

- **short text** — What are you unsure about?
  - helper: A few words. You don't have to explain the whole situation.
- **scale 0 10** — How uncomfortable does leaving it unknown feel?
- **short text** — One small way you'll let it stay unknown today
  - helper: Something you can actually do, or actually not do. "I'll wait until Thursday before deciding" counts. Checking it one more time doesn't.
- **scale 0 10** — And now, having written that?
- **Closing reflection** — What do you notice?
  - helper: Optional.

> Not knowing for a while is not the same as giving up.

---

## Exposure ladder

- id: `ws_exposure_ladder`
- Library description (English): Therapist-built: graded steps, unlocked one at a time.
- Library description (Hinglish): _missing_
- who can open it: therapist_only

### Hinglish

_No Hinglish body._

### English (approved, for comparison)

> Your therapist builds this ladder with you, in session. Each step is added together, and unlocked when you are both ready for it.

- **Text** — You will see only the steps that have been unlocked for you. For each one, rate how difficult it feels before you try it, and again afterwards. If a step feels like too much on the day, it can wait.
- **scale 0 100** — Before you try this step, how difficult does it feel?
- **scale 0 100** — And afterwards?

> Each step is yours to take when you are ready.

---
