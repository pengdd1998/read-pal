# 🚀 RUN read-pal NOW - 5 Minute Guide

## Step 1: Install (2 minutes)
```bash
cd /Volumes/ExternalDisk/read-pal
pnpm install
```

## Step 2: Start Databases (1 minute)
```bash
docker-compose up -d
```
Wait for: "postgres-readpal-postgres-1  healthy"

## Step 3: Environment (30 seconds)
```bash
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > packages/api/.env
echo "JWT_SECRET=dev-secret-change-in-production" >> packages/api/.env
```

Get API key: https://console.anthropic.com/

## Step 4: Start Servers (1 minute)

### Terminal 1 - API:
```bash
cd packages/api
pnpm dev
```
Wait for: "read-pal API Server... Status: 🟢 Online"

### Terminal 2 - Web:
```bash
cd packages/web
pnpm dev
```
Wait for: "Ready in Xms"

## Step 5: Use the App\!

1. Open http://localhost:3000
2. Click "Get Started Free"
3. Enter any email/password (demo mode)
4. Upload an EPUB or PDF
5. Start reading\!

---

## 🎮 Quick Test

### Option 1: Use Your Own Book
- Click "Choose File"
- Select EPUB/PDF from your computer
- Wait for processing
- Start reading\!

### Option 2: Test Without Book
- Just explore the interface
- Check out the library page
- See the reading interface

---

## 🛑 Stop Everything

```bash
# Stop servers: Ctrl+C in both terminals

# Stop databases
docker-compose down

# Clean up (optional)
pnpm clean
```

---

## 🐛 Problems?

### Port in Use?
```bash
lsof -i :3000 | grep LISTEN
kill -9 <PID>
```

### Docker Not Starting?
```bash
docker-compose down
docker-compose up -d
```

### Book Upload Failing?
- Check file size (< 50MB)
- Check file type (.epub or .pdf)
- Check browser console (F12)

### AI Not Working?
- Check ANTHROPIC_API_KEY in packages/api/.env
- Check API credits: https://console.anthropic.com/
- Check API server terminal for errors

---

## 📱 What to Test

1. ✅ Sign up / Sign in
2. ✅ Upload book file
3. ✅ Read chapters (arrow keys)
4. ✅ Change theme (3 options)
5. ✅ Adjust font size
6. ✅ Highlight text
7. ✅ Add note
8. ✅ Create bookmark
9. ✅ Chat with AI (bottom right)
10. ✅ Check progress saved

---

## 🎯 Success Criteria

You're successful if:
- [ ] App loads without errors
- [ ] You can create account
- [ ] You can upload a book
- [ ] You can read the book
- [ ] AI responds to your questions

If all 5 pass: **CONGRATULATIONS\! IT WORKS\!** 🎉

---

*Total time: ~5 minutes*
*Result: Fully functional AI reading companion*
