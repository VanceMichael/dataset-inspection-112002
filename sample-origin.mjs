const materials = new Map([
  ['INDEX4', '镜头索引第四版'], ['INDEX5', '镜头索引第五版'],
  ['IMG11', '合成镜头 S11 的标记图'], ['IMG12', '合成镜头 S12 的标记图'],
  ['IMG13', '合成镜头 S13 的标记图'], ['NOTE7', '光线采集统一说明第七版'],
]);

export function gatewayFor(register, history, send) {
  const requests = new Map();
  return async (request, response, url, stage) => {
    if (!url.pathname.startsWith('/sample/')) return false;
    const app = register.filter((row) => row.availableFrom <= stage && row.kind === 'application').at(-1)?.payload;
    const permitted = register.filter((row) => row.availableFrom <= stage && row.kind === 'groups' &&
      row.payload.edition === app?.edition).at(-1)?.payload.groups ?? {};
    if (request.method === 'GET' && url.pathname.startsWith('/sample/requests/')) {
      const receipt = requests.get(url.pathname.split('/').at(-1));
      if (!receipt) send(response, 404, { error: '未查到领取申请' });
      else send(response, 200, receipt);
      return true;
    }
    if (request.method !== 'POST' || url.pathname !== '/sample/requests') {
      send(response, 404, { error: '领取地址不存在' });
      return true;
    }
    let body = '';
    for await (const buffer of request) body += buffer;
    let input;
    try { input = JSON.parse(body); }
    catch { send(response, 400, { error: '请传送 JSON 对象' }); return true; }
    if (!input || !/^[a-zA-Z0-9-]{1,32}$/.test(input.requestId ?? '') || !Array.isArray(input.materials)) {
      send(response, 400, { error: '缺少领取号或原件清单' });
      return true;
    }
    const previous = requests.get(input.requestId);
    if (previous) {
      send(response, 409, { error: '领取号已经受理，可查询凭证' });
      return true;
    }
    if (input.application !== app?.application || input.edition !== app?.edition) {
      send(response, 409, { error: '当前没有这版受理' });
      return true;
    }
    const known = new Map(history.filter((row) => row.availableFrom <= stage && row.payload.edition === app.edition &&
      row.kind === 'pickup').map((row) => [row.payload.ticket, row.payload.state]));
    const committed = [...known.values()].filter((state) => state !== 'failed').length;
    const issued = [...requests.values()].filter((r) => r.edition === app.edition)
      .flatMap((r) => r.items).filter((item) => item.state === 'delivered').length;
    let remaining = Math.max(0, app.quota - committed - issued);
    const allowed = new Set(Object.values(permitted).flat());
    const items = [...new Set(input.materials)].map((material, index) => {
      if (!allowed.has(material) || remaining === 0) return { material, state: 'failed', reason: '范围或余额不足' };
      remaining -= 1;
      return { material, state: 'delivered', ticket: `${input.requestId}-${index + 1}`, original: materials.get(material) };
    });
    const receipt = { application: app.application, edition: app.edition, requestId: input.requestId, items };
    requests.set(input.requestId, receipt);
    send(response, stage === 2 ? 202 : 200, stage === 2 ? { state: '待查询' } : receipt);
    return true;
  };
}
