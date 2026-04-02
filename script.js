// ==================== Global Variables ====================
let currentUser = null;
let currentPostId = null;
let currentChatUser = null;
let currentProfileUser = null;
let selectedMediaFile = null;
let selectedMediaType = null;
let editingPostId = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Agora Variables
let agoraClient = null;
let localTracks = { videoTrack: null, audioTrack: null };
let isCallActive = false;

// Admin Credentials
const ADMIN_EMAIL = 'jasim28v@gmail.com';
const ADMIN_PASSWORD = 'vv2314vv';

// ==================== Helper Functions ====================
function showToast(message, duration = 2000) {
    const toast = document.getElementById('customToast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.opacity = '0';
    }, duration);
}

function openImageModal(src) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    if (!modal || !modalImg) return;
    modalImg.src = src;
    modal.classList.add('open');
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    if (modal) modal.classList.remove('open');
}

function formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} يوم`;
    if (hours > 0) return `${hours} ساعة`;
    if (minutes > 0) return `${minutes} دقيقة`;
    return `${seconds} ثانية`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function extractHashtags(text) {
    const hashtags = text.match(/#[\w\u0600-\u06FF]+/g) || [];
    return hashtags.map(tag => tag.substring(1));
}

// ==================== Cloudinary Upload ====================
async function uploadToCloudinary(file) {
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    
    try {
        showToast('جاري رفع الملف...');
        const response = await fetch(url, { method: 'POST', body: formData });
        const data = await response.json();
        if (data.secure_url) {
            showToast('تم رفع الملف بنجاح!');
            return data.secure_url;
        }
        throw new Error('Upload failed');
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        showToast('فشل رفع الملف');
        return null;
    }
}

// ==================== Voice Recording ====================
async function startVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = await uploadToCloudinary(audioBlob);
            if (audioUrl && currentChatUser) {
                const chatId = getChatId(currentUser.uid, currentChatUser.uid);
                await db.ref(`chats/${chatId}`).push({
                    senderId: currentUser.uid,
                    audioUrl: audioUrl,
                    timestamp: Date.now(),
                    read: false
                });
                showToast('تم إرسال الرسالة الصوتية');
            }
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        document.getElementById('recordingIndicator').style.display = 'flex';
        showToast('جاري التسجيل... اضغط مرة أخرى للإيقاف');
    } catch (error) {
        console.error('Recording error:', error);
        showToast('لا يمكن الوصول إلى الميكروفون');
    }
}

function stopVoiceRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        document.getElementById('recordingIndicator').style.display = 'none';
    }
}

function toggleVoiceRecording() {
    if (isRecording) {
        stopVoiceRecording();
    } else {
        startVoiceRecording();
    }
}

// ==================== Agora Video Call ====================
async function initAgoraCall() {
    if (!agoraClient) {
        agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    }
    return agoraClient;
}

async function startVideoCallWithAgora(channelName, userId) {
    try {
        const client = await initAgoraCall();
        const token = null;
        
        await client.join(AGORA_APP_ID_CALL, channelName, token, userId);
        
        localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack();
        localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        
        await client.publish([localTracks.videoTrack, localTracks.audioTrack]);
        
        const localPlayer = document.getElementById('localVideo');
        if (localPlayer) localTracks.videoTrack.play(localPlayer);
        
        client.on("user-published", async (user, mediaType) => {
            await client.subscribe(user, mediaType);
            if (mediaType === "video") {
                const remotePlayer = document.getElementById('remoteVideo');
                if (remotePlayer) user.videoTrack.play(remotePlayer);
            }
            if (mediaType === "audio") user.audioTrack.play();
        });
        
        isCallActive = true;
        showToast('تم بدء المكالمة');
        document.getElementById('videoCallModal')?.classList.add('open');
        
    } catch (error) {
        console.error('Error starting video call:', error);
        showToast('فشل بدء المكالمة');
    }
}

async function endVideoCall() {
    if (agoraClient) {
        if (localTracks.videoTrack) localTracks.videoTrack.close();
        if (localTracks.audioTrack) localTracks.audioTrack.close();
        await agoraClient.leave();
        isCallActive = false;
        showToast('تم إنهاء المكالمة');
    }
    document.getElementById('videoCallModal')?.classList.remove('open');
}

// ==================== Theme Functions ====================
window.toggleTheme = function() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    const themeIcon = document.getElementById('themeToggle');
    if (themeIcon) {
        if (isDark) {
            themeIcon.classList.remove('fa-adjust');
            themeIcon.classList.add('fa-sun');
        } else {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-adjust');
        }
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    showToast(isDark ? 'الوضع الليلي' : 'الوضع النهاري');
};

// ==================== Logout Function ====================
window.logout = async function() {
    try {
        await auth.signOut();
        showToast('تم تسجيل الخروج بنجاح');
        setTimeout(() => {
            location.reload();
        }, 1000);
    } catch (error) {
        console.error('Logout error:', error);
        showToast('حدث خطأ أثناء تسجيل الخروج');
    }
};

// ==================== Auth Functions ====================
window.switchAuth = function(form) {
    document.getElementById('loginForm').classList.remove('active');
    document.getElementById('registerForm').classList.remove('active');
    document.getElementById(`${form}Form`).classList.add('active');
};

window.login = async function() {
    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPassword')?.value;
    const msgDiv = document.getElementById('loginMsg');

    if (!email || !password) {
        if (msgDiv) msgDiv.textContent = 'الرجاء إدخال البريد الإلكتروني وكلمة المرور';
        return;
    }

    try {
        showToast('جاري تسجيل الدخول...');
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        currentUser = userCredential.user;
        
        const snapshot = await db.ref(`users/${currentUser.uid}`).once('value');
        if (snapshot.exists()) {
            currentUser = { ...currentUser, ...snapshot.val() };
        } else {
            await db.ref(`users/${currentUser.uid}`).set({
                uid: currentUser.uid,
                name: currentUser.displayName || email.split('@')[0],
                email: email,
                bio: "مرحباً! أنا في GLOW ✨",
                avatar: "",
                cover: "",
                verified: false,
                isAdmin: false,
                blockedUsers: {},
                createdAt: Date.now()
            });
        }
        
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        
        // ✅ التحقق من المشرف - هذه هي الطريقة الصحيحة
        if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
            showToast('🌟 مرحباً بك في لوحة التحكم يا مدير!');
            await db.ref(`users/${currentUser.uid}`).update({ 
                isAdmin: true, 
                verified: true,
                role: 'admin',
                name: 'Admin GLOW'
            });
            currentUser.isAdmin = true;
            currentUser.verified = true;
            
            // فتح لوحة التحكم تلقائياً بعد 1 ثانية
            setTimeout(() => {
                openAdminPanel();
            }, 1000);
        } else {
            showToast(`مرحباً ${currentUser.displayName || 'مستخدم'}!`);
        }
        
        loadFeed();
        loadNotifications();
        
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') document.body.classList.add('dark-mode');
        
    } catch (error) {
        console.error('Login error:', error);
        if (msgDiv) msgDiv.textContent = error.message;
        showToast(error.message);
    }
};

window.register = async function() {
    const name = document.getElementById('regName')?.value;
    const email = document.getElementById('regEmail')?.value;
    const password = document.getElementById('regPass')?.value;
    const confirmPass = document.getElementById('regConfirmPass')?.value;
    const msgDiv = document.getElementById('regMsg');

    if (!name || !email || !password) {
        if (msgDiv) msgDiv.textContent = 'الرجاء ملء جميع الحقول';
        return;
    }

    if (password !== confirmPass) {
        if (msgDiv) msgDiv.textContent = 'كلمة المرور غير متطابقة';
        return;
    }

    try {
        showToast('جاري إنشاء الحساب...');
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        await userCredential.user.updateProfile({ displayName: name });
        
        await db.ref(`users/${userCredential.user.uid}`).set({
            uid: userCredential.user.uid,
            name: name,
            email: email,
            bio: "مرحباً! أنا في GLOW ✨",
            avatar: "",
            cover: "",
            verified: false,
            isAdmin: false,
            blockedUsers: {},
            createdAt: Date.now()
        });

        currentUser = userCredential.user;
        currentUser.name = name;
        
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        loadFeed();
        showToast(`أهلاً بك ${name}!`);
    } catch (error) {
        console.error('Register error:', error);
        if (msgDiv) msgDiv.textContent = error.message;
        showToast(error.message);
    }
};

// ==================== Change Avatar & Cover ====================
window.changeAvatar = async function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = await uploadToCloudinary(file);
            if (url) {
                await db.ref(`users/${currentUser.uid}`).update({ avatar: url });
                currentUser.avatar = url;
                openProfile(currentProfileUser || currentUser.uid);
                showToast('تم تغيير الصورة الشخصية بنجاح');
            }
        }
    };
    input.click();
};

window.changeCover = async function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = await uploadToCloudinary(file);
            if (url) {
                await db.ref(`users/${currentUser.uid}`).update({ cover: url });
                currentUser.cover = url;
                openProfile(currentProfileUser || currentUser.uid);
                showToast('تم تغيير صورة الغلاف بنجاح');
            }
        }
    };
    input.click();
};

// ==================== Block User ====================
async function blockUser(userId) {
    await db.ref(`users/${currentUser.uid}/blockedUsers/${userId}`).set(true);
    showToast('تم حظر المستخدم');
    loadFeed();
}

async function unblockUser(userId) {
    await db.ref(`users/${currentUser.uid}/blockedUsers/${userId}`).remove();
    showToast('تم إلغاء حظر المستخدم');
    loadFeed();
}

async function isBlocked(userId) {
    const snapshot = await db.ref(`users/${currentUser.uid}/blockedUsers/${userId}`).once('value');
    return snapshot.exists();
}

// ==================== Posts Functions ====================
window.createPost = async function() {
    const text = document.getElementById('postText')?.value;
    if (!text && !selectedMediaFile) {
        showToast('الرجاء كتابة نص أو إضافة وسائط');
        return;
    }

    let mediaUrl = "", mediaType = "";
    if (selectedMediaFile) {
        mediaType = selectedMediaFile.type.split('/')[0];
        mediaUrl = await uploadToCloudinary(selectedMediaFile);
        if (!mediaUrl) return;
    }

    const hashtags = extractHashtags(text);
    const postRef = db.ref('posts').push();
    await postRef.set({
        id: postRef.key,
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.name,
        userAvatar: currentUser.avatar || "",
        text: text,
        mediaUrl: mediaUrl,
        mediaType: mediaType,
        hashtags: hashtags,
        likes: {},
        commentsCount: 0,
        edited: false,
        timestamp: Date.now()
    });
    
    for (const tag of hashtags) {
        await db.ref(`hashtags/${tag.toLowerCase()}/${postRef.key}`).set(true);
    }

    document.getElementById('postText').value = "";
    document.getElementById('mediaPreview').innerHTML = "";
    document.getElementById('mediaPreview').style.display = "none";
    selectedMediaFile = null;
    editingPostId = null;
    closeCompose();
    loadFeed();
    showToast('تم نشر المنشور بنجاح!');
};

window.deletePost = async function(postId) {
    if (!confirm('هل أنت متأكد من حذف هذا المنشور؟')) return;
    const postSnapshot = await db.ref(`posts/${postId}`).once('value');
    const post = postSnapshot.val();
    if (post.userId !== currentUser.uid && currentUser.email !== ADMIN_EMAIL && !currentUser.isAdmin) {
        showToast('لا يمكنك حذف منشور ليس لك');
        return;
    }
    if (post.hashtags) {
        for (const tag of post.hashtags) {
            await db.ref(`hashtags/${tag.toLowerCase()}/${postId}`).remove();
        }
    }
    await db.ref(`posts/${postId}`).remove();
    loadFeed();
    showToast('تم حذف المنشور');
};

window.likePost = async function(postId) {
    const likeRef = db.ref(`posts/${postId}/likes/${currentUser.uid}`);
    const snapshot = await likeRef.once('value');
    
    if (snapshot.exists()) {
        await likeRef.remove();
    } else {
        await likeRef.set(true);
        const postSnapshot = await db.ref(`posts/${postId}`).once('value');
        const post = postSnapshot.val();
        if (post && post.userId !== currentUser.uid) {
            const notifRef = db.ref(`notifications/${post.userId}`).push();
            await notifRef.set({
                type: 'like',
                userId: currentUser.uid,
                userName: currentUser.displayName || currentUser.name,
                postId: postId,
                timestamp: Date.now(),
                read: false
            });
        }
    }
    loadFeed();
};

window.sharePost = async function(postId) {
    const postSnapshot = await db.ref(`posts/${postId}`).once('value');
    const post = postSnapshot.val();
    const shareRef = db.ref('posts').push();
    await shareRef.set({
        id: shareRef.key,
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.name,
        userAvatar: currentUser.avatar || "",
        text: `شارك منشور: ${post.text.substring(0, 100)}`,
        originalPostId: postId,
        originalUser: post.userName,
        timestamp: Date.now()
    });
    showToast('تمت المشاركة!');
};

async function loadFeed() {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;
    
    feedContainer.innerHTML = '<div class="loading"><div class="spinner"></div><span>جاري التحميل...</span></div>';

    const snapshot = await db.ref('posts').once('value');
    const posts = snapshot.val();
    if (!posts) {
        feedContainer.innerHTML = '<div class="text-center p-8 text-gray-500">لا توجد منشورات بعد</div>';
        return;
    }

    const blockedSnapshot = await db.ref(`users/${currentUser?.uid}/blockedUsers`).once('value');
    const blockedUsers = blockedSnapshot.val() || {};
    
    const postsArray = Object.values(posts)
        .filter(post => !blockedUsers[post.userId])
        .sort((a, b) => b.timestamp - a.timestamp);
    
    let html = '';
    for (const post of postsArray) {
        const isLiked = post.likes && post.likes[currentUser?.uid];
        const likesCount = post.likes ? Object.keys(post.likes).length : 0;
        const isOwner = post.userId === currentUser?.uid;
        
        let formattedText = escapeHtml(post.text);
        if (post.hashtags) {
            post.hashtags.forEach(tag => {
                const regex = new RegExp(`#${tag}`, 'gi');
                formattedText = formattedText.replace(regex, `<span class="post-hashtags" onclick="searchHashtag('${tag}')">#${tag}</span>`);
            });
        }
        
        html += `
            <div class="post-card">
                <div class="post-header">
                    <div class="post-user-info" onclick="openProfile('${post.userId}')">
                        <div class="post-avatar">
                            ${post.userAvatar ? `<img src="${post.userAvatar}">` : '<i class="fas fa-user text-white text-xl flex items-center justify-center h-full"></i>'}
                        </div>
                        <div>
                            <div class="post-username">${escapeHtml(post.userName)} ${post.verified ? '<i class="fas fa-check-circle text-[#833ab4] text-xs"></i>' : ''}</div>
                            <div class="post-time">${formatTime(post.timestamp)} ${post.edited ? '· معدل' : ''}</div>
                        </div>
                    </div>
                    ${isOwner ? `<button class="post-menu" onclick="event.stopPropagation(); deletePost('${post.id}')"><i class="fas fa-trash-alt"></i></button>` : ''}
                </div>
                ${post.mediaUrl ? `
                    ${post.mediaType === 'image' ? `<img src="${post.mediaUrl}" class="post-image" onclick="openImageModal('${post.mediaUrl}')">` : ''}
                    ${post.mediaType === 'video' ? `<video src="${post.mediaUrl}" class="post-video" controls onclick="event.stopPropagation()"></video>` : ''}
                ` : ''}
                <div class="post-actions">
                    <button class="post-action ${isLiked ? 'active' : ''}" onclick="likePost('${post.id}')"><i class="fas fa-heart"></i></button>
                    <button class="post-action" onclick="openComments('${post.id}')"><i class="fas fa-comment"></i></button>
                    <button class="post-action" onclick="sharePost('${post.id}')"><i class="fas fa-paper-plane"></i></button>
                </div>
                ${likesCount > 0 ? `<div class="post-likes">${likesCount} إعجاب</div>` : ''}
                <div class="post-caption"><span onclick="openProfile('${post.userId}')">${escapeHtml(post.userName)}</span> ${formattedText}</div>
                ${post.commentsCount > 0 ? `<div class="post-comments" onclick="openComments('${post.id}')">عرض جميع التعليقات (${post.commentsCount})</div>` : ''}
            </div>
        `;
    }
    feedContainer.innerHTML = html;
}

// ==================== Hashtag Search ====================
window.searchHashtag = async function(tag) {
    openSearch();
    document.getElementById('searchInput').value = `#${tag}`;
    await searchAll();
};

// ==================== Comments Functions ====================
window.openComments = async function(postId) {
    currentPostId = postId;
    document.getElementById('commentsPanel').classList.add('open');
    await loadComments(postId);
};

async function loadComments(postId) {
    const snapshot = await db.ref(`comments/${postId}`).once('value');
    const comments = snapshot.val();
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) return;
    
    if (!comments) {
        commentsList.innerHTML = '<div class="text-center p-4 text-gray-500">لا توجد تعليقات</div>';
        return;
    }
    
    let html = '';
    for (const [commentId, comment] of Object.entries(comments)) {
        const userSnapshot = await db.ref(`users/${comment.userId}`).once('value');
        const userData = userSnapshot.val();
        html += `
            <div class="chat-message">
                <div class="message-bubble">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <span style="font-weight: 600; cursor: pointer;" onclick="closeComments(); openProfile('${comment.userId}')">${escapeHtml(userData?.name || 'مستخدم')}</span>
                        <span style="font-size: 10px; color: #8e8e8e;">${formatTime(comment.timestamp)}</span>
                    </div>
                    <div>${escapeHtml(comment.text)}</div>
                </div>
            </div>
        `;
    }
    commentsList.innerHTML = html;
}

window.addComment = async function() {
    const text = document.getElementById('commentInput')?.value;
    if (!text || !currentPostId) return;
    
    const commentRef = db.ref(`comments/${currentPostId}`).push();
    await commentRef.set({
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.name,
        text: text,
        timestamp: Date.now()
    });
    
    const postRef = db.ref(`posts/${currentPostId}`);
    const snapshot = await postRef.once('value');
    const post = snapshot.val();
    await postRef.update({ commentsCount: (post.commentsCount || 0) + 1 });
    
    if (post.userId !== currentUser.uid) {
        const notifRef = db.ref(`notifications/${post.userId}`).push();
        await notifRef.set({
            type: 'comment',
            userId: currentUser.uid,
            userName: currentUser.displayName || currentUser.name,
            postId: currentPostId,
            text: text,
            timestamp: Date.now(),
            read: false
        });
    }
    
    document.getElementById('commentInput').value = '';
    await loadComments(currentPostId);
    loadFeed();
    showToast('تم إضافة التعليق');
};

// ==================== Profile Functions ====================
window.openMyProfile = function() { if (currentUser) openProfile(currentUser.uid); };

window.openProfile = async function(userId) {
    currentProfileUser = userId;
    const snapshot = await db.ref(`users/${userId}`).once('value');
    const userData = snapshot.val();
    if (!userData) return;
    
    const profileCover = document.getElementById('profileCover');
    if (profileCover) {
        if (userData.cover) {
            profileCover.style.backgroundImage = `url(${userData.cover})`;
            profileCover.style.backgroundSize = 'cover';
            profileCover.style.backgroundPosition = 'center';
        } else {
            profileCover.style.backgroundImage = 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)';
        }
    }
    
    const profileAvatarLarge = document.getElementById('profileAvatarLarge');
    profileAvatarLarge.innerHTML = userData.avatar ? `<img src="${userData.avatar}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-user text-5xl text-white flex items-center justify-center h-full"></i>';
    
    document.getElementById('profileName').innerHTML = `${escapeHtml(userData.name)} ${userData.verified ? '<i class="fas fa-check-circle text-[#833ab4] text-sm"></i>' : ''}`;
    document.getElementById('profileBio').textContent = userData.bio || "مرحباً! أنا في GLOW ✨";
    
    const followersSnapshot = await db.ref(`followers/${userId}`).once('value');
    const followingSnapshot = await db.ref(`following/${userId}`).once('value');
    document.getElementById('profileFollowersCount').textContent = followersSnapshot.exists() ? Object.keys(followersSnapshot.val()).length : 0;
    document.getElementById('profileFollowingCount').textContent = followingSnapshot.exists() ? Object.keys(followingSnapshot.val()).length : 0;
    
    const postsSnapshot = await db.ref('posts').once('value');
    const posts = postsSnapshot.val();
    document.getElementById('profilePostsCount').textContent = posts ? Object.values(posts).filter(p => p.userId === userId).length : 0;
    
    const buttonsDiv = document.getElementById('profileButtons');
    if (userId !== currentUser.uid) {
        const isFollowing = await checkIfFollowing(userId);
        const isBlockedUser = await isBlocked(userId);
        buttonsDiv.innerHTML = `
            <button class="profile-btn ${isFollowing ? '' : 'profile-btn-primary'}" onclick="toggleFollow('${userId}')">${isFollowing ? 'متابَع' : 'متابعة'}</button>
            <button class="profile-btn" onclick="openChat('${userId}')"><i class="fas fa-comment"></i> راسل</button>
            <button class="profile-btn" onclick="startVideoCall('${userId}')"><i class="fas fa-video"></i></button>
            ${isBlockedUser ? `<button class="profile-btn" onclick="unblockUser('${userId}')">إلغاء الحظر</button>` : `<button class="profile-btn" onclick="blockUser('${userId}')">حظر</button>`}
        `;
    } else {
        // ✅ زر لوحة التحكم يظهر هنا للمشرف
        const isAdminUser = (currentUser.email === ADMIN_EMAIL || currentUser.isAdmin);
        buttonsDiv.innerHTML = `
            <button class="profile-btn" onclick="openEditProfileModal()"><i class="fas fa-edit"></i> تعديل</button>
            <button class="profile-btn" onclick="changeAvatar()"><i class="fas fa-camera"></i> صورة</button>
            <button class="profile-btn" onclick="changeCover()"><i class="fas fa-image"></i> غلاف</button>
            ${isAdminUser ? `<button class="profile-btn profile-btn-primary" onclick="openAdminPanel()"><i class="fas fa-cog"></i> لوحة التحكم</button>` : ''}
        `;
    }
    
    await loadProfilePosts(userId);
    document.getElementById('profilePanel').classList.add('open');
};

async function checkIfFollowing(userId) {
    const snapshot = await db.ref(`followers/${userId}/${currentUser.uid}`).once('value');
    return snapshot.exists();
}

window.toggleFollow = async function(userId) {
    const isFollowing = await checkIfFollowing(userId);
    if (isFollowing) {
        await db.ref(`followers/${userId}/${currentUser.uid}`).remove();
        await db.ref(`following/${currentUser.uid}/${userId}`).remove();
        showToast('تم إلغاء المتابعة');
    } else {
        await db.ref(`followers/${userId}/${currentUser.uid}`).set({ uid: currentUser.uid, name: currentUser.displayName || currentUser.name, timestamp: Date.now() });
        await db.ref(`following/${currentUser.uid}/${userId}`).set({ uid: userId, timestamp: Date.now() });
        showToast('تم المتابعة');
        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({ type: 'follow', userId: currentUser.uid, userName: currentUser.displayName || currentUser.name, timestamp: Date.now(), read: false });
    }
    openProfile(userId);
};

async function loadProfilePosts(userId) {
    const postsSnapshot = await db.ref('posts').once('value');
    const posts = postsSnapshot.val();
    const userPosts = posts ? Object.values(posts).filter(p => p.userId === userId).sort((a, b) => b.timestamp - a.timestamp) : [];
    const grid = document.getElementById('profilePostsGrid');
    if (!grid) return;
    if (userPosts.length === 0) { grid.innerHTML = '<div class="text-center p-8 text-gray-500" style="grid-column: span 3;">لا توجد منشورات</div>'; return; }
    let html = '';
    for (const post of userPosts) {
        html += `<div class="grid-item" onclick="openComments('${post.id}')">
            ${post.mediaUrl ? (post.mediaType === 'image' ? `<img src="${post.mediaUrl}">` : `<video src="${post.mediaUrl}"></video>`) : '<div class="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-800"><i class="fas fa-file-alt text-2xl text-gray-500"></i></div>'}
        </div>`;
    }
    grid.innerHTML = html;
}

window.loadProfileMedia = async function(userId) {
    const postsSnapshot = await db.ref('posts').once('value');
    const posts = postsSnapshot.val();
    const userPosts = posts ? Object.values(posts).filter(p => p.userId === userId && p.mediaUrl).sort((a, b) => b.timestamp - a.timestamp) : [];
    const grid = document.getElementById('profilePostsGrid');
    if (!grid) return;
    if (userPosts.length === 0) { grid.innerHTML = '<div class="text-center p-8 text-gray-500" style="grid-column: span 3;">لا توجد وسائط</div>'; return; }
    let html = '';
    for (const post of userPosts) {
        html += `<div class="grid-item" onclick="openComments('${post.id}')">${post.mediaType === 'image' ? `<img src="${post.mediaUrl}">` : `<video src="${post.mediaUrl}"></video>`}</div>`;
    }
    grid.innerHTML = html;
};

// ==================== Edit Profile ====================
window.openEditProfileModal = function() {
    document.getElementById('editName').value = currentUser.displayName || currentUser.name;
    document.getElementById('editBio').value = currentUser.bio || '';
    document.getElementById('editProfileModal').classList.add('open');
};

window.closeEditProfileModal = function() { document.getElementById('editProfileModal').classList.remove('open'); };

window.saveProfileEdit = async function() {
    const newName = document.getElementById('editName')?.value;
    const newBio = document.getElementById('editBio')?.value;
    if (newName) await currentUser.updateProfile({ displayName: newName });
    await db.ref(`users/${currentUser.uid}`).update({ name: newName, bio: newBio });
    currentUser.name = newName;
    currentUser.bio = newBio;
    closeEditProfileModal();
    openProfile(currentUser.uid);
    showToast('تم حفظ التغييرات');
};

// ==================== Chat Functions ====================
function getChatId(user1, user2) { return [user1, user2].sort().join('_'); }

window.openChat = async function(userId) {
    const snapshot = await db.ref(`users/${userId}`).once('value');
    currentChatUser = snapshot.val();
    document.getElementById('chatUserName').textContent = currentChatUser.name;
    const chatAvatar = document.getElementById('chatAvatar');
    chatAvatar.innerHTML = currentChatUser.avatar ? `<img src="${currentChatUser.avatar}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-user text-white text-xl flex items-center justify-center h-full"></i>';
    await loadChatMessages(userId);
    document.getElementById('chatPanel').classList.add('open');
};

async function loadChatMessages(userId) {
    const chatId = getChatId(currentUser.uid, userId);
    db.ref(`chats/${chatId}`).on('value', (snapshot) => {
        const messages = snapshot.val();
        const container = document.getElementById('chatMessages');
        if (!container) return;
        if (!messages) { container.innerHTML = '<div class="text-center p-4 text-gray-500">لا توجد رسائل بعد</div>'; return; }
        let html = '';
        const messagesArray = Object.values(messages).sort((a, b) => a.timestamp - b.timestamp);
        for (const msg of messagesArray) {
            const isSent = msg.senderId === currentUser.uid;
            html += `<div class="chat-message ${isSent ? 'sent' : ''}">
                <div class="message-bubble ${isSent ? 'sent' : ''}">
                    ${msg.text ? escapeHtml(msg.text) : ''}
                    ${msg.imageUrl ? `<img src="${msg.imageUrl}" class="message-image" onclick="openImageModal('${msg.imageUrl}')">` : ''}
                    ${msg.audioUrl ? `<audio controls class="audio-player" src="${msg.audioUrl}"></audio>` : ''}
                </div>
            </div>`;
        }
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    });
}

window.sendChatMessage = async function() {
    const input = document.getElementById('chatMessageInput');
    const text = input?.value;
    if (!text || !currentChatUser) return;
    const chatId = getChatId(currentUser.uid, currentChatUser.uid);
    await db.ref(`chats/${chatId}`).push({ senderId: currentUser.uid, text: text, timestamp: Date.now(), read: false });
    input.value = '';
};

window.sendChatImage = async function(input) {
    const file = input.files[0];
    if (file && currentChatUser) {
        const url = await uploadToCloudinary(file);
        if (url) {
            const chatId = getChatId(currentUser.uid, currentChatUser.uid);
            await db.ref(`chats/${chatId}`).push({ senderId: currentUser.uid, imageUrl: url, timestamp: Date.now(), read: false });
        }
    }
    input.value = '';
};

// ==================== Conversations ====================
window.openConversations = async function() {
    const conversationsList = document.getElementById('conversationsList');
    conversationsList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const snapshot = await db.ref('chats').once('value');
    const chats = snapshot.val();
    if (!chats) { conversationsList.innerHTML = '<div class="text-center p-4 text-gray-500">لا توجد محادثات</div>'; document.getElementById('conversationsPanel')?.classList.add('open'); return; }
    const conversations = [];
    for (const [chatId, messages] of Object.entries(chats)) {
        const [user1, user2] = chatId.split('_');
        const otherUserId = user1 === currentUser.uid ? user2 : user1;
        const userSnapshot = await db.ref(`users/${otherUserId}`).once('value');
        const userData = userSnapshot.val();
        const lastMessage = Object.values(messages).sort((a, b) => b.timestamp - a.timestamp)[0];
        conversations.push({ userId: otherUserId, userData: userData, lastMessage: lastMessage, timestamp: lastMessage.timestamp });
    }
    conversations.sort((a, b) => b.timestamp - a.timestamp);
    let html = '';
    for (const conv of conversations) {
        html += `<div class="follower-item" onclick="closeConversations(); openChat('${conv.userId}')">
            <div class="post-avatar" style="width: 48px; height: 48px;">${conv.userData?.avatar ? `<img src="${conv.userData.avatar}">` : '<i class="fas fa-user text-white text-xl flex items-center justify-center h-full"></i>'}</div>
            <div style="flex: 1;">
                <div style="font-weight: 600;">${escapeHtml(conv.userData?.name || 'مستخدم')}</div>
                <div style="font-size: 12px; color: #8e8e8e;">${conv.lastMessage.text || conv.lastMessage.audioUrl ? 'رسالة صوتية' : 'صورة'}</div>
            </div>
        </div>`;
    }
    conversationsList.innerHTML = html;
    document.getElementById('conversationsPanel')?.classList.add('open');
};

// ==================== Notifications ====================
async function loadNotifications() {
    if (!currentUser) return;
    db.ref(`notifications/${currentUser.uid}`).on('value', (snapshot) => {
        const notifications = snapshot.val();
        const notifIcon = document.getElementById('notifIcon');
        if (!notifIcon) return;
        const existingBadge = notifIcon.querySelector('.notification-badge');
        if (notifications) {
            const unread = Object.values(notifications).filter(n => !n.read).length;
            if (unread > 0 && !existingBadge) notifIcon.innerHTML = '<i class="far fa-heart"></i><div class="notification-badge">' + unread + '</div>';
            else if (unread > 0 && existingBadge) existingBadge.textContent = unread;
            else if (unread === 0 && existingBadge) existingBadge.remove();
        } else if (existingBadge) existingBadge.remove();
    });
}

window.openNotifications = async function() {
    const snapshot = await db.ref(`notifications/${currentUser.uid}`).once('value');
    const notifications = snapshot.val();
    const container = document.getElementById('notificationsList');
    if (!notifications) { container.innerHTML = '<div class="text-center p-4 text-gray-500">لا توجد إشعارات</div>'; document.getElementById('notificationsPanel')?.classList.add('open'); return; }
    let html = '';
    for (const [id, notif] of Object.entries(notifications).sort((a, b) => b[1].timestamp - a[1].timestamp)) {
        html += `<div class="follower-item" onclick="markNotificationRead('${id}'); ${notif.type === 'like' ? `openComments('${notif.postId}')` : notif.type === 'comment' ? `openComments('${notif.postId}')` : `openProfile('${notif.userId}')`}">
            <div class="post-avatar" style="width: 44px; height: 44px;"><i class="fas ${notif.type === 'like' ? 'fa-heart' : notif.type === 'comment' ? 'fa-comment' : 'fa-user-plus'} text-white text-xl flex items-center justify-center h-full"></i></div>
            <div style="flex: 1;">
                <div><span style="font-weight: 600;">${escapeHtml(notif.userName)}</span> ${notif.type === 'like' ? 'أعجب بمنشورك' : notif.type === 'comment' ? `علق على منشورك: ${notif.text?.substring(0, 50)}` : 'بدأ بمتابعتك'}</div>
                <div style="font-size: 11px; color: #8e8e8e;">${formatTime(notif.timestamp)}</div>
            </div>
        </div>`;
    }
    container.innerHTML = html;
    document.getElementById('notificationsPanel')?.classList.add('open');
    const updates = {};
    for (const id of Object.keys(notifications)) updates[`notifications/${currentUser.uid}/${id}/read`] = true;
    await db.ref().update(updates);
    loadNotifications();
};

window.markNotificationRead = async function(notifId) { await db.ref(`notifications/${currentUser.uid}/${notifId}`).update({ read: true }); loadNotifications(); };

// ==================== Search ====================
window.searchAll = async function() {
    const query = document.getElementById('searchInput')?.value.toLowerCase();
    if (!query) { document.getElementById('searchResults').innerHTML = ''; return; }
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    const hashtagSnapshot = await db.ref('hashtags').once('value');
    const hashtags = hashtagSnapshot.val();
    let results = [];
    if (users) results.push(...Object.values(users).filter(u => u.name?.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query)).map(u => ({ type: 'user', data: u })));
    if (hashtags && query.startsWith('#')) {
        const tag = query.substring(1);
        if (hashtags[tag]) results.push({ type: 'hashtag', data: { tag: tag, count: Object.keys(hashtags[tag]).length } });
    }
    let html = '';
    for (const result of results) {
        if (result.type === 'user') html += `<div class="follower-item" onclick="closeSearch(); openProfile('${result.data.uid}')">
            <div class="post-avatar" style="width: 44px; height: 44px;">${result.data.avatar ? `<img src="${result.data.avatar}">` : '<i class="fas fa-user text-white text-xl flex items-center justify-center h-full"></i>'}</div>
            <div><div style="font-weight: 600;">${escapeHtml(result.data.name)}</div><div style="font-size: 12px; color: #8e8e8e;">${escapeHtml(result.data.email)}</div></div>
        </div>`;
        else if (result.type === 'hashtag') html += `<div class="follower-item" onclick="closeSearch(); searchHashtag('${result.data.tag}')">
            <div class="post-avatar" style="width: 44px; height: 44px; background: linear-gradient(135deg, #833ab4, #fd1d1d); display: flex; align-items: center; justify-content: center;"><i class="fas fa-hashtag text-white text-xl"></i></div>
            <div><div style="font-weight: 600; color: #833ab4;">#${escapeHtml(result.data.tag)}</div><div style="font-size: 12px; color: #8e8e8e;">${result.data.count} منشور</div></div>
        </div>`;
    }
    document.getElementById('searchResults').innerHTML = html || '<div class="text-center p-4 text-gray-500">لا توجد نتائج</div>';
};

// ==================== Admin Panel (المطلوبة) ====================
window.openAdminPanel = async function() {
    // ✅ التحقق من صلاحيات المشرف
    if (currentUser.email !== ADMIN_EMAIL && !currentUser.isAdmin) {
        showToast('🚫 غير مصرح لك بالدخول إلى لوحة التحكم');
        return;
    }
    
    showToast('🔧 جاري تحميل لوحة التحكم...');
    
    // جلب الإحصائيات
    const usersSnapshot = await db.ref('users').once('value');
    const postsSnapshot = await db.ref('posts').once('value');
    const commentsSnapshot = await db.ref('comments').once('value');
    
    const usersCount = usersSnapshot.exists() ? Object.keys(usersSnapshot.val()).length : 0;
    const postsCount = postsSnapshot.exists() ? Object.keys(postsSnapshot.val()).length : 0;
    
    let commentsCount = 0;
    if (commentsSnapshot.exists()) {
        for (const pc of Object.values(commentsSnapshot.val())) {
            commentsCount += Object.keys(pc).length;
        }
    }
    
    document.getElementById('adminUsersCount').textContent = usersCount;
    document.getElementById('adminPostsCount').textContent = postsCount;
    document.getElementById('adminCommentsCount').textContent = commentsCount;
    
    // عرض المستخدمين
    let usersHtml = '';
    if (usersSnapshot.exists()) {
        const users = Object.values(usersSnapshot.val());
        for (const user of users) {
            usersHtml += `
                <div class="admin-item">
                    <div>
                        <div class="admin-item-name">${escapeHtml(user.name)}</div>
                        <div class="admin-item-email">${escapeHtml(user.email)}</div>
                    </div>
                    <div>
                        ${!user.verified ? `<button class="admin-verify-btn" onclick="verifyUser('${user.uid}')">✅ توثيق</button>` : '<span class="text-green-500">✅ موثق</span>'}
                        <button class="admin-delete-btn" onclick="deleteUser('${user.uid}')">🗑️ حذف</button>
                    </div>
                </div>
            `;
        }
    }
    document.getElementById('adminUsersList').innerHTML = usersHtml;
    
    // عرض المنشورات
    let postsHtml = '';
    if (postsSnapshot.exists()) {
        const posts = Object.values(postsSnapshot.val()).sort((a, b) => b.timestamp - a.timestamp);
        for (const post of posts.slice(0, 20)) {
            postsHtml += `
                <div class="admin-item">
                    <div>
                        <div class="admin-item-name">${escapeHtml(post.userName)}</div>
                        <div class="admin-item-email">${escapeHtml(post.text?.substring(0, 50) || '')}</div>
                    </div>
                    <button class="admin-delete-btn" onclick="deletePost('${post.id}')">🗑️ حذف</button>
                </div>
            `;
        }
    }
    document.getElementById('adminPostsList').innerHTML = postsHtml;
    
    document.getElementById('adminPanel').classList.add('open');
};

window.verifyUser = async function(userId) {
    await db.ref(`users/${userId}`).update({ verified: true });
    showToast('تم توثيق المستخدم');
    openAdminPanel();
};

window.deleteUser = async function(userId) {
    if (confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
        await db.ref(`users/${userId}`).remove();
        showToast('تم حذف المستخدم');
        openAdminPanel();
    }
};

window.closeAdmin = function() {
    document.getElementById('adminPanel').classList.remove('open');
};

// ==================== Video Call ====================
window.startVideoCall = async function(userId) {
    const channelName = `call_${getChatId(currentUser.uid, userId)}`;
    await startVideoCallWithAgora(channelName, currentUser.uid);
    const notifRef = db.ref(`notifications/${userId}`).push();
    await notifRef.set({ type: 'call', userId: currentUser.uid, userName: currentUser.displayName, channelName: channelName, timestamp: Date.now(), read: false });
};

window.endVideoCall = endVideoCall;

// ==================== Followers List ====================
window.openFollowersList = async function(type) {
    document.getElementById('followersTitle').textContent = type === 'followers' ? 'المتابعون' : 'المتابَعون';
    const refPath = type === 'followers' ? `followers/${currentProfileUser}` : `following/${currentProfileUser}`;
    const snapshot = await db.ref(refPath).once('value');
    const data = snapshot.val();
    const container = document.getElementById('followersList');
    if (!data) { container.innerHTML = '<div class="text-center p-4 text-gray-500">لا يوجد ' + (type === 'followers' ? 'متابعون' : 'متابَعون') + '</div>'; document.getElementById('followersPanel')?.classList.add('open'); return; }
    let html = '';
    for (const [userId] of Object.entries(data)) {
        const userSnapshot = await db.ref(`users/${userId}`).once('value');
        const userData = userSnapshot.val();
        html += `<div class="follower-item" onclick="closeFollowers(); openProfile('${userId}')">
            <div class="post-avatar" style="width: 48px; height: 48px;">${userData?.avatar ? `<img src="${userData.avatar}">` : '<i class="fas fa-user text-white text-xl flex items-center justify-center h-full"></i>'}</div>
            <div><div style="font-weight: 600;">${escapeHtml(userData?.name || 'مستخدم')}</div><div style="font-size: 12px; color: #8e8e8e;">${escapeHtml(userData?.bio?.substring(0, 50) || '')}</div></div>
        </div>`;
    }
    container.innerHTML = html;
    document.getElementById('followersPanel')?.classList.add('open');
};

// ==================== Stories ====================
window.openStories = async function() { await loadStories(); document.getElementById('storiesPanel')?.classList.add('open'); };
async function loadStories() {
    const snapshot = await db.ref('stories').once('value');
    const stories = snapshot.val();
    const container = document.getElementById('storiesList');
    container.innerHTML = `<div class="story-card" onclick="addStory()"><div class="add-story-btn"><i class="fas fa-plus"></i></div><div class="story-name">إضافة قصة</div></div>`;
    if (stories) for (const [storyId, story] of Object.entries(stories)) {
        const userSnapshot = await db.ref(`users/${story.userId}`).once('value');
        const userData = userSnapshot.val();
        if (Date.now() - story.timestamp < 86400000) container.innerHTML += `<div class="story-card" onclick="viewStory('${storyId}')"><div class="story-ring"><div class="story-avatar" style="background-image: url('${story.mediaUrl}'); background-size: cover; background-position: center;"></div></div><div class="story-name">${escapeHtml(userData?.name || '')}</div></div>`;
    }
}
window.addStory = async function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = await uploadToCloudinary(file);
            if (url) {
                await db.ref('stories').push({ userId: currentUser.uid, mediaUrl: url, mediaType: file.type.split('/')[0], timestamp: Date.now() });
                showToast('تم إضافة القصة');
                await loadStories();
            }
        }
    };
    input.click();
};
function viewStory(storyId) { showToast('مشاهدة القصة قريباً...'); }

// ==================== Panel Controls ====================
window.closeCompose = function() { document.getElementById('composeModal').classList.remove('open'); document.getElementById('postText').value = ''; document.getElementById('mediaPreview').innerHTML = ''; document.getElementById('mediaPreview').style.display = 'none'; selectedMediaFile = null; editingPostId = null; };
window.openCompose = function() { document.getElementById('composeModal').classList.add('open'); };
window.closeComments = function() { document.getElementById('commentsPanel').classList.remove('open'); currentPostId = null; };
window.closeProfile = function() { document.getElementById('profilePanel').classList.remove('open'); };
window.closeChat = function() { document.getElementById('chatPanel').classList.remove('open'); if (isRecording) stopVoiceRecording(); currentChatUser = null; };
window.closeConversations = function() { document.getElementById('conversationsPanel').classList.remove('open'); };
window.closeNotifications = function() { document.getElementById('notificationsPanel').classList.remove('open'); };
window.closeSearch = function() { document.getElementById('searchPanel').classList.remove('open'); document.getElementById('searchInput').value = ''; document.getElementById('searchResults').innerHTML = ''; };
window.openSearch = function() { document.getElementById('searchPanel').classList.add('open'); };
window.closeStories = function() { document.getElementById('storiesPanel').classList.remove('open'); };
window.closeFollowers = function() { document.getElementById('followersPanel').classList.remove('open'); };
window.goToHome = function() { switchTab('home'); };
window.goBack = function() { const panels = ['composeModal','commentsPanel','profilePanel','chatPanel','conversationsPanel','notificationsPanel','searchPanel','storiesPanel','followersPanel','adminPanel']; for (const p of panels) { const el = document.getElementById(p); if (el?.classList.contains('open')) { el.classList.remove('open'); return; } } };
window.switchTab = function(tab) { if (tab === 'home') loadFeed(); };
window.previewMedia = function(input, type) {
    const file = input.files[0];
    if (file) {
        selectedMediaFile = file;
        const preview = document.getElementById('mediaPreview');
        const reader = new FileReader();
        reader.onload = function(e) {
            if (type === 'image') preview.innerHTML = `<img src="${e.target.result}">`;
            else if (type === 'video') preview.innerHTML = `<video src="${e.target.result}" controls></video>`;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
};
window.toggleVoiceRecording = toggleVoiceRecording;

// ==================== Auth State Listener ====================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const snapshot = await db.ref(`users/${user.uid}`).once('value');
        if (snapshot.exists()) {
            currentUser = { ...currentUser, ...snapshot.val() };
        } else {
            await db.ref(`users/${user.uid}`).set({ 
                uid: user.uid, 
                name: user.displayName || user.email.split('@')[0], 
                email: user.email, 
                bio: "مرحباً! أنا في GLOW ✨", 
                avatar: "", 
                cover: "", 
                verified: false, 
                isAdmin: user.email === ADMIN_EMAIL,
                blockedUsers: {}, 
                createdAt: Date.now() 
            });
            currentUser.isAdmin = user.email === ADMIN_EMAIL;
        }
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') document.body.classList.add('dark-mode');
        loadFeed();
        loadNotifications();
    } else {
        document.getElementById('authScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }
});

// Export all functions to window
window.switchAuth = switchAuth;
window.login = login;
window.register = register;
window.createPost = createPost;
window.deletePost = deletePost;
window.likePost = likePost;
window.sharePost = sharePost;
window.openComments = openComments;
window.addComment = addComment;
window.openMyProfile = openMyProfile;
window.openProfile = openProfile;
window.toggleFollow = toggleFollow;
window.openEditProfileModal = openEditProfileModal;
window.closeEditProfileModal = closeEditProfileModal;
window.saveProfileEdit = saveProfileEdit;
window.changeAvatar = changeAvatar;
window.changeCover = changeCover;
window.openChat = openChat;
window.sendChatMessage = sendChatMessage;
window.sendChatImage = sendChatImage;
window.openConversations = openConversations;
window.openNotifications = openNotifications;
window.markNotificationRead = markNotificationRead;
window.searchAll = searchAll;
window.searchHashtag = searchHashtag;
window.openFollowersList = openFollowersList;
window.openStories = openStories;
window.addStory = addStory;
window.closeCompose = closeCompose;
window.openCompose = openCompose;
window.closeComments = closeComments;
window.closeProfile = closeProfile;
window.closeChat = closeChat;
window.closeConversations = closeConversations;
window.closeNotifications = closeNotifications;
window.closeSearch = closeSearch;
window.openSearch = openSearch;
window.closeStories = closeStories;
window.closeFollowers = closeFollowers;
window.goToHome = goToHome;
window.goBack = goBack;
window.switchTab = switchTab;
window.previewMedia = previewMedia;
window.toggleTheme = toggleTheme;
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
window.blockUser = blockUser;
window.unblockUser = unblockUser;
window.startVideoCall = startVideoCall;
window.endVideoCall = endVideoCall;
window.openAdminPanel = openAdminPanel;
window.closeAdmin = closeAdmin;
window.verifyUser = verifyUser;
window.deleteUser = deleteUser;
window.loadProfileMedia = loadProfileMedia;
window.toggleVoiceRecording = toggleVoiceRecording;
window.logout = logout;
