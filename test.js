// 引入 @vue/reactivity 需要注释
// const {reactive, effect} = window.VueReactivity;

const obj = reactive({
    time: new Date(),
    clickNum: 0
})
effect(() => {
    let dom = document.getElementById('text');
    dom.innerHTML = `Time: ${obj.time}, Click: ${obj.clickNum}`
})

let clickBtn = document.getElementById('click-button');
clickBtn.addEventListener('click', () => {
    obj.time = new Date();
    obj.clickNum += 1;
})