# LaTeX 完整渲染测试

这是一份用于验证 Formula MD 排版能力的文档。行内公式 $E = mc^2$ 应当与正文自然对齐，转义的美元符号 \$100 不应被识别为公式。

## 基础公式

高斯积分：

$$
\int_{-\infty}^{\infty} e^{-x^2}\,\mathrm{d}x = \sqrt{\pi}
$$

带上下标、分式、根号和极限：

\[
\lim_{n\to\infty}\left(1+\frac{1}{n}\right)^n=e,
\qquad
\sum_{k=1}^{n} k^3=\left[\frac{n(n+1)}{2}\right]^2.
\]

## AMS 对齐、编号与引用

\begin{align}
\nabla\cdot\mathbf{E} &= \frac{\rho}{\varepsilon_0}, \label{eq:gauss}\\
\nabla\cdot\mathbf{B} &= 0,\\
\nabla\times\mathbf{E} &= -\frac{\partial\mathbf{B}}{\partial t},\\
\nabla\times\mathbf{B} &= \mu_0\mathbf{J}+\mu_0\varepsilon_0\frac{\partial\mathbf{E}}{\partial t}.
\end{align}

式 $\eqref{eq:gauss}$ 是高斯定律。

## 矩阵与分段函数

$$
\mathbf{A}=
\begin{bmatrix}
1 & 2 & 3\\
4 & 5 & 6\\
7 & 8 & 9
\end{bmatrix},
\qquad
f(x)=
\begin{cases}
x^2, & x\ge 0,\\
-x, & x<0.
\end{cases}
$$

## 宏、物理与化学式

\begin{equation}
\newcommand{\R}{\mathbb{R}}
f:\R^n\to\R,\qquad
\pdv{f}{x_i}=\frac{\partial f}{\partial x_i},\qquad
\ce{2H2 + O2 -> 2H2O}.
\end{equation}

## 复杂符号

$$
\oint_{\partial\Omega}\mathbf{F}\cdot\mathrm{d}\mathbf{r}
=\iint_{\Omega}(\nabla\times\mathbf{F})\cdot\mathbf{n}\,\mathrm{d}S,
\quad
\cancel{x}+y,
\quad
\left\langle \psi \middle| \hat{H} \middle| \psi \right\rangle.
$$

## Markdown 共存测试

公式中的下划线不应变成强调：$x_{i_j} + \texttt{word\_with\_underscore}$。

代码中的公式分隔符不应渲染：`const price = "$100";`。

```tex
% 代码块保持原样
\sum_{i=1}^{n} x_i
```

> 数学之美，在于精确，也在于排版后的秩序。

| 能力 | 状态 |
| --- | --- |
| 行内与块级公式 | ✓ |
| AMS 环境和自动编号 | ✓ |
| 矩阵、分段函数 | ✓ |
| 自定义宏、物理、化学 | ✓ |
| 离线字体与渲染 | ✓ |

$\Gamma=h_s n_s C_{thermal,s} \sqrt{T_g}$

$\Gamma=h_i n_i c_{bohm,i} \sqrt{T_e}$

$c_{bohm,i}=\sqrt{Z_{i}e/m_i}$