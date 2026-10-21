from pathlib import Path
import json,csv,hashlib,collections,sys

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[2]
repo=root
out=root/'data_review/phase2_20261021'
data=json.loads((root/'network-data.js').read_text().split('=',1)[1].strip().rstrip(';'))
old=json.loads((repo/'data_backup/phase1_20261021/network-data.js').read_text().split('=',1)[1].strip().rstrip(';'))
rawpath=next((repo/'research_data').glob('先填*.csv'))
raw=list(csv.DictReader(rawpath.open(encoding='utf-8-sig',newline='')))
rawkey=list(raw[0])[2];nodes=data['nodes'];edges=data['edges'];by={n['id']:n for n in nodes}
assert len(nodes)==140==len(by)==len(raw)
assert set(data)>=set(['meta','nodes','edges'])
assert len(data['meta']['departments'])==7
for i,(r,n,o) in enumerate(zip(raw,nodes,old['nodes']),1):
    assert n['id']==str(i)==o['id'] and n['number']==i
    assert r[rawkey]==n['name']==o['name']
    assert n['jmaCount']==int(r['甲马数量'])
    assert n['rawRecord']=={'order':i,'csvRow':i+1,'name':r[rawkey],'category':r['大类'],'pageGroup':r['页码组'],'jmaCount':r['甲马数量']}
    assert all(n['originalProfile'][k]==o[k] for k in n['originalProfile'])
    assert set(o)<=set(n)
    assert n['department'] in data['meta']['departments']
    assert n['color']==data['meta']['departments'][n['department']]
    assert (root/'缩放后'/n['imageFile']).is_file()
    assert n['source']==o['source'] and n['sourceReviewStatus']=='unverified_origin'
    if n['recordKind']=='collection':assert n['position']==n['secondaryPosition']=='' and n['traditionalFunction']=='集合记录，不指派单一神职'
assert sum(n['jmaCount'] for n in nodes)==1071
assert data['meta']['nodeCount']==len(nodes) and data['meta']['edgeCount']==len(edges)
assert len({e['id'] for e in edges})==len(edges)
seen=set();supply={};degrees=collections.Counter()
ev=list(csv.DictReader((out/'relations_evidence.csv').open(encoding='utf-8-sig',newline='')));evby={r['relation_id']:r for r in ev}
assert len(ev)==len(edges)==len(evby)
for e in edges:
    assert set(old['edges'][0])<=set(e)
    a,b=e['source'],e['target'];assert a in by and b in by and a!=b
    assert e['sourceName']==by[a]['name'] and e['targetName']==by[b]['name']
    assert e['type'] in ['business','supply','culture']
    assert all(e[k] for k in ['scenario','reason','sourceRole','targetRole','evidenceType','evidenceIds','confidence','limitations','reviewStatus'])
    assert e['evidenceType']=='design_simulation' and e['reviewStatus']=='design_proposal_pending_human_review'
    assert all(data['meta']['references'][k]['url'].startswith('https://') for k in e['evidenceIds'])
    assert all(by[i]['reviewStatus']=='source_supported_scope_limited' for i in [a,b])
    if e['type']=='supply':
        assert e['direction']=='source_to_target' and e['style']=='dash'
        assert all(e[k] for k in ['upstreamProvides','downstreamResponsibility','dependencyReason'])
        supply.setdefault(a,[]).append(b);key=(a,b,e['type'],e['label'],e['scenario'])
    else:key=(*sorted([a,b]),e['type'],e['label'],e['scenario'])
    assert key not in seen;seen.add(key)
    r=evby[e['id']]
    for field,csvkey in [('source','source_id'),('target','target_id'),('type','relation_type'),('label','relation_label'),('reason','reason'),('scenario','scenario'),('evidenceType','evidence_type'),('confidence','confidence')]:assert e[field]==r[csvkey]
    degrees.update([a,b])
for a in supply:
    visiting=set()
    def walk(i):
        assert i not in visiting,'Supply cycle';visiting.add(i)
        for b in supply.get(i,[]):walk(b)
        visiting.remove(i)
    walk(a)
assert sum(degrees.values())==2*len(edges)
stats=json.loads((out/'network_statistics.json').read_text())
assert stats['isolated_node_count']==sum(degrees[n['id']]==0 for n in nodes)
assert stats['department_counts']==dict(collections.Counter(n['department'] for n in nodes))
assert stats['edge_count']==len(edges) and stats['relation_type_counts']=={t:sum(e['type']==t for e in edges) for t in ['business','supply','culture']}
assert stats['cross_department_edge_count']==sum(by[e['source']]['department']!=by[e['target']]['department'] for e in edges)
checks={}
for f,expected in [('functions_review_140.csv',140),('field_review_700.csv',700),('image_mapping_140.csv',140),('manual_relation_review_checklist.csv',len(edges)+6),('excluded_relation_candidates.csv',6)]:
    rows=list(csv.DictReader((out/f).open(encoding='utf-8-sig',newline='')));assert len(rows)==expected;assert all(None not in r for r in rows);checks[f]=len(rows)
    if f=='functions_review_140.csv':assert [r['id'] for r in rows]==[str(i) for i in range(1,141)]
    if f=='manual_relation_review_checklist.csv':assert all(not r['human_reviewer'] and not r['human_review_date'] for r in rows)
assert (root/'network-data.js').read_bytes()==(out/'network-data.candidate.js').read_bytes()
diff={'meta_changes':[{'field':k,'original_value':old['meta'].get(k,'<字段不存在>'),'new_value':v,'reason':'恢复CSV溯源、更新实际计数、区分文化联系与演化、增加证据与审核说明'} for k,v in data['meta'].items() if old['meta'].get(k)!=v], 'legacy_edge_count':len(old['edges']),'new_edge_count':len(edges),'legacy_edge_ids':[e['id'] for e in old['edges']],'new_edge_ids':[e['id'] for e in edges],'same_edge_ids':sorted(set(e['id'] for e in old['edges'])&set(e['id'] for e in edges)),'policy':'旧边整体隔离。新边由有明确端点职能和场景的人工可读策划逐条构造；相同ID若存在不表示沿用旧依据。'}
(out/'dataset_diff.json').write_text(json.dumps(diff,ensure_ascii=False,indent=2))
result={'static_checks_passed':True,'raw_records':140,'raw_name_id_order_intact':True,'raw_jma_count_sum':1071,'unique_node_ids':140,'unique_edge_ids':len(edges),'images_existing':140,'evidence_rows_match_edges':True,'no_self_edges_or_dangling_references':True,'no_meaningless_duplicates':True,'supply_cycles':0,'csv_row_counts':checks,'human_review_complete':False,'culture_edges':0,'manual_review_note':'17条实际新边全查清单；另6条排除候选，不将AI预检当人工签核。'}
(out/'static_validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False,indent=2))
