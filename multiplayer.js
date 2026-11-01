(()=> {
  const $=s=>document.querySelector(s);
  const status=$('#mpStatus'), address=$('#mpServerUrl'), name=$('#mpName'), codeInput=$('#mpRoomCode');
  const create=$('#mpCreate'), join=$('#mpJoin'), copy=$('#mpCopy'), disconnect=$('#mpDisconnect');
  if(!status||!address||!create||!join)return;
  let socket=null, room='', playerId='', lastSent=0, rival=null, connected=false;
  address.value=localStorage.getItem('crx-mp-url')||'';
  name.value=localStorage.getItem('crx-mp-name')||'Racer';
  function say(message){status.textContent=message}
  function send(data){if(socket&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(data))}
  function drawRival(p){
    if(!p){if(rival)rival.remove();rival=null;return}
    const viewport=$('#viewport');if(!viewport)return;
    if(!rival){rival=document.createElement('div');rival.className='mp-rival';rival.innerHTML='<span class="mp-rival-label"></span><b>🏎️</b>';viewport.appendChild(rival)}
    rival.querySelector('.mp-rival-label').textContent=p.name+' · '+Math.round(p.speed||0)+' KM/H';
    rival.style.left=(50+(Math.max(-4.25,Math.min(4.25,p.x||0))*8.2))+'%';
    rival.style.setProperty('--rival-color',p.car||'#ff426d');
  }
  function connect(action){
    const url=address.value.trim();
    if(!/^wss?:\/\//i.test(url)){say('Paste your Wispbyte WebSocket address first.');return}
    if(socket&&socket.readyState===WebSocket.OPEN){send({type:action,name:name.value,code:codeInput.value});return}
    say('Connecting to race server…');
    localStorage.setItem('crx-mp-url',url);localStorage.setItem('crx-mp-name',name.value.trim().slice(0,14)||'Racer');
    try{socket=new WebSocket(url.replace(/\/$/,'')+'/multiplayer')}catch(e){say('Could not connect. Check the server address.');return}
    socket.addEventListener('open',()=>{connected=true;say('Connected! Joining room…');send({type:action,name:name.value,code:codeInput.value})});
    socket.addEventListener('message',event=>{
      let msg;try{msg=JSON.parse(event.data)}catch{return}
      if(msg.type==='joined'){room=msg.room;playerId=msg.playerId;codeInput.value=room;say('ROOM '+room+' · Waiting for your friend…');renderPlayers(msg.players||[]);if(copy)copy.disabled=false}
      if(msg.type==='players')renderPlayers(msg.players||[]);
      if(msg.type==='state'&&msg.player.id!==playerId)drawRival(msg.player);
      if(msg.type==='error')say(msg.message||'Multiplayer error.');
    });
    socket.addEventListener('close',()=>{connected=false;room='';playerId='';drawRival(null);say('Disconnected from server.')});
    socket.addEventListener('error',()=>say('Could not reach server. Check Wispbyte is running and the URL is correct.'));
  }
  function renderPlayers(players){
    const other=players.find(p=>p.id!==playerId);
    drawRival(other);
    say('ROOM '+room+' · '+players.length+'/2 RACERS'+(other?' · '+other.name+' CONNECTED':' · SHARE THE CODE'));
  }
  create.addEventListener('click',()=>connect('create'));
  join.addEventListener('click',()=>{if(!codeInput.value.trim()){say('Enter your friend’s room code.');return}connect('join')});
  if(copy)copy.addEventListener('click',()=>{if(room&&navigator.clipboard)navigator.clipboard.writeText(room).then(()=>say('Room code copied: '+room)).catch(()=>say('Room code: '+room));else say('Room code: '+room)});
  if(disconnect)disconnect.addEventListener('click',()=>{send({type:'leave'});if(socket)socket.close();drawRival(null);say('Disconnected.')});
  window.addEventListener('beforeunload',()=>{try{send({type:'leave'})}catch{}});
  window.addEventListener('crx-game-state',event=>{
    const now=Date.now();if(now-lastSent<80||!connected)return;lastSent=now;
    const d=event.detail||{};
    send({type:'state',x:d.x,speed:d.speed,car:d.car,ready:!!d.ready});
  });
})();