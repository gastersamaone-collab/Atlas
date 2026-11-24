'use strict';

const categories = {
  all: ['Обзор', '◈', 'Проекты, люди, идеи и задачи в одном месте.'],
  project: ['Проекты', '▣', 'Чек-листы, прогресс и следующие шаги.'],
  person: ['Люди', '♙', 'Дни рождения, аллергии и важные сведения.'],
  idea: ['Идеи', '✧', 'Идеи, к которым хочется вернуться.'],
  plan: ['Планы', '▤', 'Намерения, сроки и связанные записи.'],
  task: ['Задачи', '✓', 'Дела, сроки и статусы.'],
  note: ['Заметки', '≡', 'Записи и связи между ними.']
};
const singular = {project:'Проект', person:'Человек', idea:'Идея', plan:'План', task:'Задача', note:'Заметка'};
const statuses = {planned:'Запланировано',active:'В работе',paused:'На паузе',done:'Готово'};
const key = 'atlas.records.v1';
const $ = id => document.getElementById(id);
const form = $('form');
const statusTypes = ['project','plan','task','idea'];
const dueTypes = ['plan','task'];
let records = [];
let view = 'all';
let editing = null;
let opened = null;
let draftFields = {};
try {
  const saved = localStorage.getItem(key);
  if (saved !== null) records = validateImport({schemaVersion:1,records:JSON.parse(saved)});
} catch {
  $('notice').textContent = 'Не удалось прочитать сохранённые записи.';
}

function node(tag, text, attrs = {}) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  for (const [name,value] of Object.entries(attrs)) element.setAttribute(name,value);
  return element;
}
function button(text, action, attrs) {
  const element = node('button',text,{type:'button',...attrs});
  element.addEventListener('click',action);
  return element;
}
function save(next) {
  try {
    localStorage.setItem(key,JSON.stringify(next));
    records = next;
    $('notice').textContent = '';
    render();
    return true;
  } catch {
    alert('Сохранить записи не удалось. Проверь свободное место и настройки браузера.');
    return false;
  }
}
function switchView(type) {
  view = type;
  $('search').value = '';
  $('tag').value = '';
  $('status').value = '';
  render();
}
function birthdayDistance(value) {
  if (!value) return Infinity;
  const [,month,day] = value.split('-').map(Number);
  const today = new Date();
  const year = today.getFullYear();
  const start = Date.UTC(year,today.getMonth(),today.getDate());
  let next = Date.UTC(year,month-1,day);
  if (next < start) next = Date.UTC(year+1,month-1,day);
  return next-start;
}
function formatDate(value, birthday = false) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',...(birthday && value.startsWith('0004-') ? {} : {year:'numeric'}),timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));
}
function render() {
  const query = $('search').value.trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
  const searching = query.length > 0;
  $('title').textContent = searching ? 'Результаты поиска' : categories[view][0];
  $('subtitle').textContent = searching ? 'Поиск по всем категориям базы.' : categories[view][2];
  $('nav').replaceChildren(...Object.entries(categories).map(([type,[label,icon]])=>{
    const b = button(null,()=>switchView(type),{'aria-current':String(!searching && type===view)});
    b.append(node('span',icon,{'aria-hidden':'true'}),label);
    return b;
  }));
  $('stats').replaceChildren(...(!searching && view==='all' ? ['project','person','idea','task'].map(type=>{
    const b = button(null,()=>switchView(type),{class:'stat'});
    b.append(node('strong',records.filter(r=>r.type===type).length),categories[type][0]);
    return b;
  }) : []));
  const pool = records.filter(r=>searching || view==='all' || r.type===view);
  const currentTag = $('tag').value;
  const tags = [...new Set(pool.flatMap(r=>r.tags))].sort((a,b)=>a.localeCompare(b,'ru'));
  $('tag').replaceChildren(new Option('Все теги',''),...tags.map(tag=>new Option(tag,tag)));
  $('tag').value = tags.includes(currentTag) ? currentTag : '';
  const useStatus = searching || view==='all' || statusTypes.includes(view);
  $('status').parentElement.hidden = !useStatus;
  $('sort-label').hidden = searching || view!=='person';
  const visible = pool.filter(r=>{
    const linked = records.filter(other=>r.links.includes(other.id) || other.links.includes(r.id)).map(other=>other.title);
    const haystack = [r.title,r.body,r.allergies,r.birthday,r.due,r.next,statuses[r.status],...r.tags,...linked,...(r.checklist || []).map(i=>i.text)].join(' ').toLocaleLowerCase('ru');
    return query.every(word=>haystack.includes(word)) && (!$('tag').value || r.tags.includes($('tag').value)) &&
      (!useStatus || !$('status').value || r.status===$('status').value);
  });
  if (!searching && view==='person') visible.sort((a,b)=>($('sort').value==='birthday' ? birthdayDistance(a.birthday)-birthdayDistance(b.birthday) : 0) || a.title.localeCompare(b.title,'ru'));
  $('results').replaceChildren();
  if (!visible.length) {
    $('results').append(node('p',pool.length || searching ? 'По выбранным условиям ничего не найдено.' : 'Здесь пока пусто. Добавь первую запись.',{class:'empty'}));
    return;
  }
  for (const type of Object.keys(singular)) {
    const group = visible.filter(r=>r.type===type);
    if (!group.length) continue;
    const section = node('section',null,{class:'group'});
    if (view==='all' || searching) section.append(node('h2',categories[type][0]));
    const grid = node('div',null,{class:'grid'});
    grid.append(...group.map(card));
    section.append(grid);
    $('results').append(section);
  }
}
function progress(record) {
  const count = record.checklist.length;
  const done = record.checklist.filter(i=>i.done).length;
  const wrapper = node('div',null,{class:'progress'});
  const heading = node('div');
  heading.append(node('span','Чек-лист'),node('span',count ? done + ' из ' + count + ' · ' + Math.round(done/count*100) + '%' : 'Пока пуст'));
  wrapper.append(heading,node('progress',null,{max:count || 1,value:done,'aria-label':'Прогресс проекта'}));
  return wrapper;
}
function badge(record) {
  return node('span',statuses[record.status],{class:'badge','data-status':record.status});
}
function facts(record) {
  const entries = [];
  if (record.birthday) entries.push(['День рождения',formatDate(record.birthday,true)]);
  if (record.allergies) entries.push(['Аллергии',record.allergies]);
  if (record.due) entries.push(['Срок',formatDate(record.due)]);
  if (record.next) entries.push(['Следующий шаг',record.next]);
  return entries.map(([label,value])=>{
    const p = node('p',null,{class:'next detail-text'});
    p.append(node('strong',label+' · '),value);
    return p;
  });
}
function card(record) {
  const article = node('article',null,{class:'card'});
  const top = node('div',null,{class:'card-top'});
  top.append(node('span',categories[record.type][1]+'  '+singular[record.type],{class:'kind'}));
  if (record.status) top.append(badge(record));
  const h = node('h3');
  h.append(button(record.title,()=>showDetail(record.id)));
  article.append(top,h);
  if (record.body) article.append(node('p',record.body,{class:'summary'}));
  if (record.type==='project') article.append(progress(record));
  article.append(...facts(record));
  const tags = node('div',null,{class:'tags'});
  tags.append(...record.tags.map(tag=>button('#'+tag,()=>{ $('tag').value=tag;render(); },{class:'tag'})));
  article.append(tags);
  return article;
}
function showDetail(id) {
  const record = records.find(r=>r.id===id);
  if (!record) return;
  opened = id;
  const content = $('detail-content');
  const head = node('div',null,{class:'dialog-head'});
  head.append(node('h2',record.title),button('×',()=>$('detail').close(),{'aria-label':'Закрыть'}));
  content.replaceChildren(head);
  if (record.status) {
    const status = node('div');
    status.append(badge(record));
    content.append(status);
  }
  if (record.body) content.append(node('p',record.body,{class:'detail-text'}));
  content.append(...facts(record));
  if (record.tags.length) content.append(node('p',record.tags.map(t=>'#'+t).join(' · ')));
  if (record.type==='project') {
    content.append(progress(record));
    for (const [index,item] of record.checklist.entries()) {
      const label = node('label',null,{class:'check'});
      const input = node('input',null,{type:'checkbox'});
      input.checked = item.done;
      input.addEventListener('change',()=>{
        const checklist = record.checklist.map((entry,i)=>i===index ? {...entry,done:input.checked} : entry);
        if (save(records.map(r=>r.id===id ? {...r,checklist,updatedAt:new Date().toISOString()} : r))) {
          showDetail(id);
          content.querySelectorAll('input')[index]?.focus();
        } else input.checked = item.done;
      });
      label.append(input,item.text);
      content.append(label);
    }
  }
  const related = records.filter(r=>r.id!==id && (record.links.includes(r.id) || r.links.includes(id)));
  if (related.length) {
    const links = node('div',null,{class:'related'});
    links.append(...related.map(r=>button(r.title,()=>showDetail(r.id))));
    content.append(node('h3','Связанные записи'),links);
  }
  const actions = node('div');
  actions.append(button('Редактировать',()=>openEditor(record),{class:'primary'}));
  content.append(actions);
  if (!$('detail').open) $('detail').showModal();
  else head.querySelector('button').focus();
}
function renderFields() {
  const type = $('type').value;
  const fields = $('fields');
  fields.replaceChildren();
  function field(label,name,input) {
    const wrapper = node('label',label);
    input.name = name;
    input.value = draftFields[name] || '';
    wrapper.append(input);
    fields.append(wrapper);
  }
  if (statusTypes.includes(type)) {
    const select = node('select');
    select.append(...Object.entries(statuses).map(([id,label])=>new Option(label,id)));
    field('Статус','status',select);
    select.value = draftFields.status || 'planned';
  }
  if (type==='person') {
    field('День рождения (ГГГГ-ММ-ДД или ММ-ДД)','birthday',node('input',null,{placeholder:'Например, 11-24',pattern:'([0-9]{4}-)?[0-9]{2}-[0-9]{2}'}));
    field('Аллергии','allergies',node('input'));
  }
  if (dueTypes.includes(type)) field('Срок','due',node('input',null,{type:'date'}));
  if (type==='project') {
    field('Следующий шаг','next',node('input'));
    field('Чек-лист · по одному пункту на строку, [x] для выполненных','checklist',node('textarea',null,{rows:'5'}));
  }
}
function openEditor(record = null) {
  editing = record?.id || null;
  draftFields = {...record,birthday:record?.birthday?.replace(/^0004-/,''),
    checklist:record?.checklist?.map(item=>(item.done?'[x] ':'[ ] ')+item.text).join('\n')};
  $('form-title').textContent = record ? 'Редактировать запись' : 'Новая запись';
  $('type').value = record?.type || (view==='all' ? 'note' : view);
  for (const name of ['title','body','tags']) form.elements[name].value = name==='tags' ? record?.tags.join(', ') || '' : record?.[name] || '';
  $('delete').hidden = !editing;
  $('links').replaceChildren();
  for (const other of records.filter(r=>r.id!==editing)) {
    const label = node('label',null,{class:'check'});
    const input = node('input',null,{type:'checkbox',name:'links',value:other.id});
    input.checked = record?.links.includes(other.id) || false;
    label.append(input,other.title);
    $('links').append(label);
  }
  if (!$('links').children.length) $('links').append(node('p','Добавь ещё одну запись, чтобы создать связь.'));
  renderFields();
  $('editor').showModal();
  form.elements.title.focus();
}
function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value+'T00:00:00Z');
  return !Number.isNaN(+date) && date.toISOString().slice(0,10)===value;
}
$('type').addEventListener('change',()=>{
  for (const input of $('fields').querySelectorAll('[name]')) draftFields[input.name] = input.value;
  renderFields();
});
$('close').onclick = ()=>$('editor').close();
$('add').onclick = ()=>openEditor();
$('delete').onclick = ()=>{
  if (!confirm('Удалить эту запись и её связи?')) return;
  if (save(records.filter(r=>r.id!==editing).map(r=>({...r,links:r.links.filter(id=>id!==editing)})))) {
    $('editor').close();
    if ($('detail').open) $('detail').close();
  }
};
form.addEventListener('submit',event=>{
  event.preventDefault();
  const data = new FormData(form);
  const value = name => (data.get(name) || '').trim();
  if (!value('title')) {
    alert('Введи название или имя.');
    form.elements.title.focus();
    return;
  }
  const type = value('type');
  const id = editing || crypto.randomUUID();
  const record = {id,type,title:value('title'),body:value('body'),tags:[...new Set(value('tags').split(',').map(t=>t.trim()).filter(Boolean))],
    links:data.getAll('links'),updatedAt:new Date().toISOString()};
  if (statusTypes.includes(type)) record.status = value('status');
  if (dueTypes.includes(type)) record.due = value('due');
  if (type==='person') {
    const raw = value('birthday');
    record.birthday = raw.length===5 ? '0004-'+raw : raw;
    if (record.birthday && !isDate(record.birthday)) {
      alert('Проверь день рождения. Введи дату в формате ГГГГ-ММ-ДД или ММ-ДД.');
      form.elements.birthday.focus();
      return;
    }
    record.allergies = value('allergies');
  }
  if (type==='project') {
    record.next = value('next');
    record.checklist = value('checklist').split('\n').map(line=>line.trim()).filter(Boolean)
      .map(line=>({done:/^\[x\]/i.test(line),text:line.replace(/^\[(x| )\]\s*/i,'')})).filter(item=>item.text);
  }
  if (save(editing ? records.map(r=>r.id===id ? record : r) : [...records,record])) {
    $('editor').close();
    if (!$('detail').open || opened===id) showDetail(id);
  }
});
$('detail').addEventListener('close',()=>{opened=null;});
$('status').append(...Object.entries(statuses).map(([id,label])=>new Option(label,id)));
$('type').append(...Object.entries(singular).map(([id,label])=>new Option(label,id)));
$('search').addEventListener('input',render);
for (const id of ['status','tag','sort']) $(id).addEventListener('change',render);
document.addEventListener('keydown',event=>{
  if (event.key==='/' && !$('editor').open && !$('detail').open && !event.target.matches('input, textarea, select, [contenteditable]')) {
    event.preventDefault();
    $('search').focus();
  }
});
$('export').onclick = ()=>{
  const blob = new Blob([JSON.stringify({schemaVersion:1,records},null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const link = node('a',null,{href:url,download:'atlas.json'});
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('import').onclick = ()=>$('file').click();
function validateImport(data) {
  const strings = values => Array.isArray(values) && values.every(value=>typeof value==='string');
  if (data?.schemaVersion!==1 || !Array.isArray(data.records)) throw Error('Ожидается экспорт Атласа версии 1.');
  const imported = data.records;
  const used = new Set();
  for (const r of imported) {
    if (!r || typeof r.id!=='string' || !r.id || used.has(r.id) || !Object.hasOwn(singular,r.type) ||
      typeof r.title!=='string' || !r.title.trim() || typeof r.body!=='string' || !strings(r.tags) || !strings(r.links) ||
      (statusTypes.includes(r.type) ? !Object.hasOwn(statuses,r.status) : r.status!=null) ||
      (r.birthday != null && (typeof r.birthday!=='string' || (r.birthday && !isDate(r.birthday)))) ||
      (r.due != null && (typeof r.due!=='string' || (r.due && !isDate(r.due)))) ||
      [r.allergies,r.next].some(v=>v!=null && typeof v!=='string') ||
      (r.type==='project' ? (!Array.isArray(r.checklist) || !r.checklist.every(i=>i && typeof i.done==='boolean' && typeof i.text==='string')) : r.checklist != null)) {
      throw Error('В файле есть запись с некорректными полями.');
    }
    used.add(r.id);
  }
  if (imported.some(r=>r.links.some(id=>!used.has(id) || id===r.id))) throw Error('В файле есть ссылка на отсутствующую или ту же запись.');
  return imported;
}
$('file').addEventListener('change',async event=>{
  const input = event.target;
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const imported = validateImport(JSON.parse(await file.text()));
    if (confirm('Заменить текущую базу импортом? Текущие записи можно предварительно сохранить через экспорт.')) {
      if (save(imported)) $('notice').textContent = 'Импортировано записей: '+records.length;
    }
  } catch (error) {
    $('notice').textContent = 'Ошибка импорта. '+error.message;
  }
});
render();
