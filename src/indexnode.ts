//目录栈类节点
export class IndexStackNode {
    depth: number;
    text: string;
    blockId: string; // Added property for Siyuan block ID
    documentPath: string; // Added property for the full document path
    children: IndexStack;
    listType: string; // Added property
    taskStatus: string; // Added property for task list status ([ ] or [x])
    icon: string;
    subFileCount: number;
    constructor(depth: number, text: string, listType: string = "unordered", taskStatus: string = "", icon: string = "", subFileCount: number = 0) {
        this.depth = depth;
        this.text = text;
        this.blockId = ""; // Initialize
        this.documentPath = ""; // Initialize
        this.children = new IndexStack();
        this.listType = listType;
        this.taskStatus = taskStatus; // Initialize
        this.icon = icon;
        this.subFileCount = subFileCount;
    }
}

//目录栈类
export class IndexStack {
    stack: IndexStackNode[];
    basePath: string;
    notebookId: string;
    pPath: string;
    constructor() {
        this.stack = [];
    }

    push(item: IndexStackNode) {
        return this.stack.push(item);
    }

    pop() {
        return this.stack.pop();
    }

    peek() {
        if (this.stack.length > 0) {
            return this.stack[this.stack.length - 1]
        }
    }

    clear() {
        this.stack = [];
    }

    isEmpty() {
        return this.stack.length === 0;
    }
}

//目录队列节点
export class IndexQueueNode {
    depth: number;
    text: string;
    children: IndexQueue;
    constructor(depth: number, text: string) {
        this.depth = depth;
        this.text = text;
        this.children = new IndexQueue();
    }
}

//目录队列
export class IndexQueue {

    queue: IndexQueueNode[];

    constructor() {
        this.queue = [];
    }

    push(item: IndexQueueNode) {
        return this.queue.push(item);
    }

    pop() {
        return this.queue.shift();
    }

    getFront() {
        return this.queue[0];
    }
    getRear() {
        return this.queue[this.queue.length - 1]
    }

    clear() {
        this.queue = [];
    }

    isEmpty() {
        return this.queue.length === 0;
    }

    getSize(){
        return this.queue.length;
    }
}