# Flop Client: start here

This folder is a real Minecraft launcher. You don't need to know how to code to run it. Follow the parts in order and stop whenever you like: each part adds something on top of the last.

| Part | What you get | Time |
|---|---|---|
| 1. Install Node.js | The one program Flop needs to run | 5 min |
| 2. Open Flop | Make instances, browse Modrinth, install mods and shaders | 5 min |
| 3. Microsoft sign-in | Press Play and actually start Minecraft | 20 min, then wait for Mojang |
| 4. Email codes | Your own Flop accounts with 6-digit email codes | 20 min |
| 5. Flop PvP mod | Keystrokes, CPS and the Right Shift menu inside the game | next project |
| 6. Make an installer | A normal "Flop Client Setup.exe" you can share | 10 min |

---

## Part 1. Install Node.js

1. Go to **https://nodejs.org**.
2. Download the version marked **LTS** and install it. Click Next on everything.
3. Restart your computer once.

## Part 2. Open Flop

**First, unzip it.** Right-click **flop-client.zip** and choose **Extract All… → Extract**. Then open the new **flop-client** folder. Double-clicking files while they're still inside the zip won't work.

**Windows:** double-click **Start Flop (Windows).bat**.

**Mac:** right-click **Start Flop (Mac).command** and choose **Open**. If your Mac says it can't open it, open the Terminal app, type `bash ` (with a space), drag the file into the Terminal window, and press Enter.

The first time, a black window downloads what Flop needs. That takes a few minutes. After that, Flop opens straight away.

Before you share Flop with anyone, open **config.json** in Notepad (Windows) or TextEdit (Mac) and put your email between the quotes on the `contactEmail` line. Modrinth asks apps to include a way to contact the developer.

What works right away:
- **+ Add instance** with any Minecraft version, using Fabric, Quilt or Vanilla.
- **Browse content**: real Modrinth search. Installing Litematica also installs MaLiLib, and installing a shader also installs Iris and Sodium.
- **Flop packs**: one-click Performance, Shaders, Quality of life and Building sets.
- Turning mods on and off, checking for updates, and import or export of `.mrpack` modpacks.

**Play** needs Part 3.

## Part 3. Microsoft sign-in (so Play works)

Minecraft only lets people play with the Microsoft account that bought the game. For your launcher to ask for that sign-in, Microsoft has to know your app exists. This is free.

1. Go to **https://portal.azure.com** and sign in with any Microsoft account.
2. In the search bar at the top, type **App registrations** and open it. Click **New registration**.
3. Fill it in:
   - **Name:** `Flop Client`. The name must not contain Minecraft, Mojang, Microsoft or Xbox.
   - **Supported account types:** **Personal Microsoft accounts only**.
   - Leave **Redirect URI** empty.
   - Click **Register**.
4. You're now on the app's Overview page. Copy the **Application (client) ID**. It looks like `1a2b3c4d-....`. Also copy the **Directory (tenant) ID** and keep both in a note.
5. In the left menu click **Authentication**:
   - Click **Add a platform** (or **Add a redirect URI**), choose **Mobile and desktop applications**, tick `https://login.microsoftonline.com/common/oauth2/nativeclient` and save.
   - Find **Allow public client flows** and set it to **Yes**. Click **Save**. If you skip this, sign-in fails with error `AADSTS70002`.
6. **Ask Mojang to approve your app.** Go to **https://aka.ms/mce-reviewappid** and fill in the form with your Application (client) ID, your Directory (tenant) ID, the email on your Azure account, and one sentence such as "Flop Client is a Minecraft launcher with instances and Modrinth mod support." Mojang reviews these about once a week. Don't send it more than once.
7. Open **config.json** and paste the Application (client) ID between the quotes on the `microsoftClientId` line. Save, then close and reopen Flop.

Now **Link Microsoft account** at the top of Flop shows a short code. Press **Open Microsoft**, type the code, sign in, and come back. Flop finishes on its own.

If you see "Mojang hasn't approved this app's Azure ID yet", step 6 is still waiting. Everything else in Flop keeps working while you wait.

## Part 4. Email codes (your own Flop accounts)

This gives Flop the email login with a 6-digit code. It uses **Supabase**, which is free for small apps. Your Flop account is separate from Minecraft: players sign in with email first, then link Microsoft once to play.

1. Go to **https://supabase.com**, sign up, and click **New project**. Name it `flop`, make up a database password (save it somewhere), pick the region closest to you, and create it. Wait a minute while it sets up.
2. Open **Project Settings → API** (on newer projects it's called **API Keys**). Copy:
   - the **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - the **anon public** key (or the **publishable** key on newer projects)
3. Paste them into **config.json** on the `supabaseUrl` and `supabaseAnonKey` lines.
4. Make Supabase send a code instead of a link. Go to **Authentication → Emails → Templates**:
   - Open **Magic Link** and replace the message with something like:
     `Your Flop Client sign-in code is {{ .Token }}. It expires soon. If you didn't ask for this, ignore this email.`
   - Do the same for **Confirm signup**, because brand-new users get that one.
   - Save both. `{{ .Token }}` is where the 6-digit code goes.
5. Close and reopen Flop. You'll see the email sign-in screen.

**Before lots of people use it:** Supabase's built-in email only sends a few messages per hour. Under **Authentication → Emails → SMTP Settings**, connect a sending service such as Resend (free tier) so codes always arrive.

To turn email sign-in off again, empty those two lines in config.json.

## Part 5. The Flop PvP mod (Right Shift menu)

The launcher can't change what happens *inside* Minecraft. Keystrokes, CPS, armor HUD, toggle sprint and the Right Shift menu have to be a **Fabric mod**: a small Java program that runs inside the game. Flop would then install it into every Fabric instance automatically, like a built-in pack.

This is the next project. It needs Java and IntelliJ IDEA Community (both free), and it gets its own step-by-step guide. Ask Claude: "Make the Flop PvP Fabric mod with the Right Shift menu," and say which Minecraft version you play most.

## Part 6. Make a real installer to share

1. Open a terminal in this folder. On Windows: open the folder, click the address bar, type `cmd` and press Enter. On a Mac: right-click the folder and choose **New Terminal at Folder**.
2. Type `npm run dist` and press Enter.
3. When it finishes, look in the new **dist** folder:
   - Windows: **Flop Client Setup 0.1.0.exe**
   - Mac: **Flop Client-0.1.0.dmg** (a Mac installer has to be built on a Mac)

Friends who run it will see "Windows protected your PC". They click **More info → Run anyway**. Getting rid of that warning needs a paid code-signing certificate, which is worth buying once Flop has real users.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| "Node.js isn't installed yet" | Do Part 1, restart the computer, try again. |
| The black window closes right away | You're probably still inside the zip. Unzip it first (Part 2). If it still happens, open `flop-start-log.txt` in this folder and send it to Claude. |
| "Microsoft sign-in isn't set up yet" | Do Part 3 and restart Flop. |
| `AADSTS70002` | Part 3, step 5: turn on **Allow public client flows**. |
| "Mojang hasn't approved this app's Azure ID yet" | Wait for the approval from Part 3, step 6. |
| "This Microsoft account doesn't own Minecraft: Java Edition" | Sign in with the account that bought the game. |
| "Fabric doesn't support Minecraft X yet" | Pick an older version, or wait a few days after a new release. |
| "X has no file for Minecraft Y" | That mod hasn't updated to your version yet. Try an older Minecraft version. |
| The game crashes on start | Open the instance → **Logs** tab. Turn mods off one at a time on the **Content** tab to find the cause. |
| No email code arrives | Check spam. Then Part 4, "Before lots of people use it". |

## Rules to stay on the right side of

- Don't put "Minecraft" in your app's name or logo. "Flop Client" is fine.
- Flop downloads the game from Mojang's own servers. Never put Mojang's game files in your installer.
- Don't sell anything that gives a gameplay advantage.
- Big servers such as Hypixel only allow certain mods. Check before you add PvP features in Part 5.
- Each mod has its own license. Flop downloads mods from Modrinth when the player installs them, which is the safe way to do it.

## What's inside this folder

| Path | What it is |
|---|---|
| `config.json` | Your settings from Parts 3 and 4 |
| `ui/` | The screens you see: `index.html`, `style.css`, `app.js` |
| `main.js`, `preload.js` | Connect the screens to the parts below |
| `backend/launch.js` | Gets Java, Fabric or Quilt ready and starts Minecraft |
| `backend/modrinth.js` | Search, installs, dependencies and updates |
| `backend/instances.js` | Creating, changing and deleting instances |
| `backend/java.js` | Downloads the right Java for each Minecraft version |
| `backend/auth-microsoft.js` | Microsoft → Xbox → Minecraft sign-in |
| `backend/auth-email.js` | Email-code Flop accounts through Supabase |
| `backend/mrpack.js` | Importing and exporting `.mrpack` modpacks |

Flop keeps instances, Java and game files in its own data folder. **Settings → Open data folder** takes you there.
